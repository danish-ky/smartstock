"""SmartStock billing addon: audited manual payments, test Razorpay, PDF sales invoice."""
import hashlib
import hmac
import io
import json
import os
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from drf_spectacular.utils import extend_schema
from drf_spectacular.types import OpenApiTypes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError, PermissionDenied
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from .models import Order, Payment, RazorpayAttempt
from .serializers import OrderSerializer

OPERATORS = ('admin', 'manager', 'staff')


def can_operate(user):
    return user.is_authenticated and (user.is_superuser or user.role in OPERATORS)


def permitted_order(user, order_id, lock=False):
    """Enforce per-customer read access for invoices and payment history.

    Unowned customer orders return 404 to avoid enumeration.
    Gateway start and verify are operator-only, checked separately.
    """
    if not user.is_authenticated:
        raise PermissionDenied('Authentication required.')
    qs = Order.objects.select_for_update() if lock else Order.objects.all()
    if can_operate(user):
        return get_object_or_404(qs, pk=order_id)
    if user.role == 'user':
        return get_object_or_404(qs, pk=order_id, customer__user_id=user.pk)
    raise PermissionDenied('Insufficient permission.')


def paid_amount(order):
    return order.payments.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')


def payment_state(order):
    amount = paid_amount(order)
    return 'paid' if amount >= order.total else 'partial' if amount > 0 else 'unpaid'


class ManualPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    method = serializers.ChoiceField(choices=[('cash','Cash'),('upi','UPI'),('card','Card'),('bank','Bank transfer')])
    reference = serializers.CharField(required=False, allow_blank=True, max_length=120)


class ManualPaymentView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request, order_id):
        order = permitted_order(request.user, order_id)
        is_operator = can_operate(request.user)
        records = [
            {'id': p.pk, 'amount': str(p.amount), 'method': p.method,
             'created_at': p.created_at,
             **({'reference': p.reference} if is_operator else {})}
            for p in order.payments.all()
        ]
        return Response({'payments': records,
                         'paid_amount': str(paid_amount(order)),
                         'payment_status': payment_state(order)})

    @extend_schema(request=ManualPaymentSerializer, responses={201: OpenApiTypes.OBJECT})
    @transaction.atomic
    def post(self, request, order_id):
        if not can_operate(request.user):
            return Response({'detail':'Insufficient permission.'}, status=403)
        serializer = ManualPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = get_object_or_404(Order.objects.select_for_update(), pk=order_id)
        if order.status == Order.Status.CANCELLED:
            raise ValidationError('Cancelled orders cannot accept payments.')
        if order.gateway_attempts.filter(status='created').exists():
            raise ValidationError('An online checkout exists. Resolve it before entering a manual payment.')
        value = serializer.validated_data['amount']
        if value > order.total - paid_amount(order):
            raise ValidationError({'amount':'Amount exceeds outstanding order balance.'})
        p = Payment.objects.create(order=order, amount=value,
            method=serializer.validated_data['method'],
            reference=serializer.validated_data.get('reference',''), recorded_by=request.user)
        return Response({'id':p.id,'order':OrderSerializer(order).data}, status=201)


def gateway_client():
    key_id = os.environ.get('RAZORPAY_KEY_ID','').strip()
    key_secret = os.environ.get('RAZORPAY_KEY_SECRET','').strip()
    if not key_id.startswith('rzp_test_') or not key_secret:
        return None
    import razorpay
    return razorpay.Client(auth=(key_id, key_secret))


class RazorpayStartView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.OBJECT})
    @transaction.atomic
    def post(self, request, order_id):
        if not can_operate(request.user):
            raise PermissionDenied('Payment collection is restricted to staff and managers.')
        order = permitted_order(request.user, order_id, lock=True)
        client = gateway_client()
        if client is None:
            return Response({'detail':'Razorpay TEST credentials are not configured.'}, status=503)
        if order.status == Order.Status.CANCELLED:
            raise ValidationError('Cancelled order.')
        outstanding = order.total - paid_amount(order)
        if outstanding <= 0:
            raise ValidationError('This order is already paid.')
        amount_paise = int(outstanding * 100)
        existing = order.gateway_attempts.filter(status='created', amount_paise=amount_paise).first()
        if existing:
            attempt = existing
        else:
            if order.gateway_attempts.filter(status='created').exists():
                raise ValidationError('An unresolved checkout already exists for this order.')
            try:
                remote = client.order.create({'amount':amount_paise,'currency':'INR',
                    'receipt':f'SS-{order.pk}', 'notes': {'smartstock_order':str(order.pk)}})
            except Exception:
                return Response({'detail':'Razorpay service unavailable. Try again later.'}, status=502)
            attempt = RazorpayAttempt.objects.create(order=order,
                        gateway_order_id=remote['id'],amount_paise=amount_paise)
        return Response({'key_id':os.environ['RAZORPAY_KEY_ID'],
                         'razorpay_order_id':attempt.gateway_order_id,
                         'amount':amount_paise, 'currency':'INR',
                         'name':'SmartStock — TEST PAYMENT', 'description':order.number})


def _confirm_captured(razorpay_order_id, payment_id):
    """Verify on server and record exactly one payment, even after duplicate callbacks."""
    client = gateway_client()
    if client is None:
        raise ValidationError('Gateway not configured.')
    try:
        remote = client.payment.fetch(payment_id)
    except Exception:
        raise ValidationError('Cannot verify payment with gateway at this time.')
    if (remote.get('status') != 'captured' or remote.get('order_id') != razorpay_order_id
        or remote.get('currency') != 'INR'):
        raise ValidationError('Payment is not verified as captured.')
    with transaction.atomic():
        attempt = get_object_or_404(RazorpayAttempt.objects.select_for_update(), gateway_order_id=razorpay_order_id)
        order = Order.objects.select_for_update().get(pk=attempt.order_id)
        if int(remote.get('amount') or 0) != attempt.amount_paise:
            raise ValidationError('Payment amount mismatch.')
        existing = Payment.objects.filter(gateway_payment_id=payment_id).first()
        if existing:
            if existing.order_id != order.pk:
                raise ValidationError('Payment already belongs to a different order.')
            return order
        if order.status == Order.Status.CANCELLED:
            raise ValidationError('Order cancelled. Manual payment reconciliation required.')
        amount = Decimal(attempt.amount_paise) / Decimal('100')
        if paid_amount(order) + amount > order.total:
            raise ValidationError('Paid amount exceeds the order total. Reconciliation required.')
        Payment.objects.create(order=order, amount=amount, method='razorpay',
                   reference=payment_id, gateway_payment_id=payment_id)
        attempt.status='paid'
        attempt.save(update_fields=['status'])
        return order


class RazorpayVerifySerializer(serializers.Serializer):
    razorpay_order_id = serializers.CharField(max_length=120)
    razorpay_payment_id = serializers.CharField(max_length=120)
    razorpay_signature = serializers.CharField(max_length=256)


class RazorpayVerifyView(APIView):
    permission_classes = [IsAuthenticated]
    @extend_schema(request=RazorpayVerifySerializer, responses={200: OpenApiTypes.OBJECT})
    def post(self, request, order_id):
        if not can_operate(request.user):
            raise PermissionDenied('Payment verification is restricted to staff and managers.')
        permitted_order(request.user, order_id)
        serializer = RazorpayVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data=serializer.validated_data
        attempt = get_object_or_404(RazorpayAttempt, gateway_order_id=data['razorpay_order_id'], order_id=order_id)
        secret = os.environ.get('RAZORPAY_KEY_SECRET','')
        expected=hmac.new(secret.encode(),
            f"{attempt.gateway_order_id}|{data['razorpay_payment_id']}".encode(),hashlib.sha256).hexdigest()
        if not secret or not hmac.compare_digest(expected,data['razorpay_signature']):
            raise ValidationError('Invalid payment signature.')
        order = _confirm_captured(attempt.gateway_order_id, data['razorpay_payment_id'])
        return Response({'verified':True, 'order':OrderSerializer(order).data})


class RazorpayWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    @extend_schema(exclude=True)
    def post(self, request):
        secret = os.environ.get('RAZORPAY_WEBHOOK_SECRET','')
        signature = request.headers.get('X-Razorpay-Signature','')
        digest = hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest()
        if not secret or not hmac.compare_digest(digest, signature):
            return Response({'detail':'Invalid webhook signature.'},status=403)
        try:
            payload=json.loads(request.body)
            if payload.get('event')=='payment.captured':
                entity=payload['payload']['payment']['entity']
                _confirm_captured(entity['order_id'],entity['id'])
        except (ValueError, KeyError, TypeError, ValidationError):
            return Response({'detail':'Webhook could not be reconciled.'},status=400)
        return Response({'ok':True})


class OrderInvoiceView(APIView):
    permission_classes = [IsAuthenticated]
    @extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    def get(self, request, order_id):
        permitted_order(request.user, order_id)
        order = get_object_or_404(Order.objects.select_related('customer','created_by').prefetch_related('items__product'),pk=order_id)
        buffer=io.BytesIO()
        pdf=canvas.Canvas(buffer,pagesize=A4)
        w,h=A4
        def header():
            pdf.setFillColor(colors.HexColor('#122943'))
            pdf.rect(0,h-102,w,102,fill=1,stroke=0)
            pdf.setFillColor(colors.white)
            pdf.setFont('Helvetica-Bold',21)
            pdf.drawString(42,h-49,os.environ.get('SMARTSTOCK_BUSINESS_NAME','SmartStock'))
            pdf.setFont('Helvetica',10)
            pdf.drawString(42,h-69,'SALES INVOICE  |  Demo document; not a GST tax invoice')
            pdf.setFillColor(colors.black)
        header()
        pdf.setFont('Helvetica-Bold',12)
        pdf.drawString(42,h-137, f"Invoice {order.number}")
        pdf.setFont('Helvetica',10)
        pdf.drawString(42,h-157,f"Date: {timezone.localtime(order.created_at).strftime('%d %b %Y')}")
        pdf.drawString(42,h-176,f"Customer: {order.customer.name[:65]}")
        pdf.drawString(42,h-195,f"Order: {order.status.title()}    Payment: {payment_state(order).title()}")
        y=h-235
        pdf.setFont('Helvetica-Bold',10)
        pdf.drawString(42,y,'ITEM / SKU')
        pdf.drawRightString(415,y,'QTY')
        pdf.drawRightString(485,y,'RATE')
        pdf.drawRightString(550,y,'TOTAL')
        y-=12
        pdf.line(42,y,550,y)
        for item in order.items.all():
            y-=25
            if y<85:
                pdf.showPage();header();y=h-135
            pdf.setFont('Helvetica',9)
            pdf.drawString(42,y,f"{item.product.name[:42]} ({item.product.sku[:20]})")
            pdf.drawRightString(415,y,str(item.quantity))
            pdf.drawRightString(485,y,f"{item.unit_price:,.2f}")
            pdf.drawRightString(550,y,f"{item.subtotal:,.2f}")
        if y<140:pdf.showPage();header();y=h-135
        y-=28
        pdf.line(42,y+16,550,y+16)
        pdf.setFont('Helvetica-Bold',12)
        pdf.drawString(42,y,'Grand total (INR)')
        pdf.drawRightString(550,y,f"{order.total:,.2f}")
        pdf.setFont('Helvetica',10)
        pdf.drawString(42,y-24,f"Amount received: INR {paid_amount(order):,.2f}")
        pdf.drawString(42,y-42,f"Balance due: INR {order.total-paid_amount(order):,.2f}")
        pdf.setFont('Helvetica-Oblique',8)
        pdf.drawString(42,55,'Internal assessment invoice. Add taxes, GSTIN and legal fields before real use.')
        pdf.save()
        response=HttpResponse(buffer.getvalue(),content_type='application/pdf')
        response['Content-Disposition']=f'attachment; filename="{order.number}-invoice.pdf"'
        response['Cache-Control']='private, no-store'
        return response
