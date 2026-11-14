"""Supplier purchase orders and atomic, auditable goods receiving.

This module deliberately does not alter existing customer sales-order services.
"""
from decimal import Decimal
from io import BytesIO

from django.http import FileResponse
from drf_spectacular.types import OpenApiTypes

from .grn_pdf import build_goods_received_note

from django.db import transaction
from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from .models import (
    Product, PurchaseOrder, PurchaseOrderItem, PurchaseReceipt,
    StockMovement, Supplier,
)
from .services import adjust_stock

MANAGERS = ('admin', 'manager')
OPERATORS = ('admin', 'manager', 'staff')


class PurchaseOrderPermission(BasePermission):
    """Customer accounts cannot read internal supplier prices or purchase orders."""
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        roles = OPERATORS if getattr(view, 'action', None) in ('list', 'retrieve', 'receive', 'receipt_pdf') else MANAGERS
        return user.role in roles


class PurchaseLineCreateSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1, max_value=1000000)
    unit_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0.00'), required=False
    )


class PurchaseCreateSerializer(serializers.Serializer):
    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all())
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    items = PurchaseLineCreateSerializer(many=True, allow_empty=False)

    def validate(self, attrs):
        supplier = attrs['supplier']
        seen = set()
        for line in attrs['items']:
            product = line['product']
            if product.pk in seen:
                raise serializers.ValidationError({'items': 'A product may appear only once.'})
            seen.add(product.pk)
            if product.supplier_id is not None and product.supplier_id != supplier.pk:
                raise serializers.ValidationError({
                    'items': f'{product.name} belongs to a different supplier.'
                })
        return attrs


class PurchaseReceiveLineSerializer(serializers.Serializer):
    item = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=1000000)


class PurchaseReceiveSerializer(serializers.Serializer):
    items = PurchaseReceiveLineSerializer(many=True, allow_empty=False)
    note = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate_items(self, value):
        ids = [line['item'] for line in value]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError('A purchase line may appear only once.')
        return value


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    sku = serializers.CharField(source='product.sku', read_only=True)
    remaining_quantity = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = ('id', 'product', 'product_name', 'sku', 'quantity',
                  'received_quantity', 'remaining_quantity', 'unit_cost', 'subtotal')
        read_only_fields = fields


class PurchaseReceiptMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = StockMovement
        fields = ('id', 'product_name', 'product_sku', 'quantity',
                  'stock_before', 'stock_after', 'note', 'created_at')
        read_only_fields = fields


class PurchaseReceiptSerializer(serializers.ModelSerializer):
    received_by_name = serializers.CharField(source='received_by.username', read_only=True)
    movements = PurchaseReceiptMovementSerializer(source='stock_movements', many=True, read_only=True)

    class Meta:
        model = PurchaseReceipt
        fields = ('id', 'received_by_name', 'note', 'created_at', 'movements')
        read_only_fields = fields


class PurchaseOrderSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    total = serializers.DecimalField(max_digits=20, decimal_places=2, read_only=True)
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    receipts = PurchaseReceiptSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = ('id', 'number', 'supplier', 'supplier_name', 'status', 'notes',
                  'total', 'items', 'receipts', 'created_by_name',
                  'ordered_at', 'created_at', 'updated_at')
        read_only_fields = fields


@transaction.atomic
def create_purchase_order(*, supplier, lines, actor, notes=''):
    if not lines:
        raise ValidationError({'items': 'Select at least one product.'})
    # Revalidate at the write boundary; the serializer handles API input, too.
    ids = [line['product'].pk for line in lines]
    if len(ids) != len(set(ids)):
        raise ValidationError({'items': 'Duplicate products are not allowed.'})
    products = {
        product.pk: product for product in Product.objects.filter(pk__in=ids, is_active=True)
    }
    if len(products) != len(ids):
        raise ValidationError({'items': 'One or more products are unavailable.'})
    for line in lines:
        product = products[line['product'].pk]
        quantity = line['quantity']
        if type(quantity) is not int or not 1 <= quantity <= 1000000:
            raise ValidationError({'items': 'Quantities must be positive whole numbers.'})
        if product.supplier_id is not None and product.supplier_id != supplier.pk:
            raise ValidationError({'items': f'{product.name} belongs to another supplier.'})
        cost = line.get('unit_cost', product.cost)
        if not isinstance(cost, Decimal):
            cost = Decimal(str(cost))
        if not cost.is_finite() or cost < 0 or cost.as_tuple().exponent < -2 or cost >= Decimal('10000000000'):
            raise ValidationError({'items': 'Invalid unit cost.'})
    po = PurchaseOrder.objects.create(supplier=supplier, created_by=actor, notes=notes)
    po.number = f'PO-{po.pk:05d}'
    po.save(update_fields=['number', 'updated_at'])
    PurchaseOrderItem.objects.bulk_create([
        PurchaseOrderItem(
            purchase_order=po, product=products[line['product'].pk],
            quantity=line['quantity'], unit_cost=line.get('unit_cost', products[line['product'].pk].cost),
        ) for line in lines
    ])
    return po


@transaction.atomic
def place_purchase_order(*, po_id):
    po = get_object_or_404(PurchaseOrder.objects.select_for_update(), pk=po_id)
    if po.status != PurchaseOrder.Status.DRAFT:
        raise ValidationError({'status': 'Only draft purchase orders can be placed.'})
    if not po.items.exists():
        raise ValidationError({'items': 'An empty purchase order cannot be placed.'})
    po.status = PurchaseOrder.Status.ORDERED
    po.ordered_at = timezone.now()
    po.save(update_fields=['status', 'ordered_at', 'updated_at'])
    return po


@transaction.atomic
def receive_purchase_order(*, po_id, lines, actor, note=''):
    po = get_object_or_404(PurchaseOrder.objects.select_for_update(), pk=po_id)
    if po.status not in (PurchaseOrder.Status.ORDERED, PurchaseOrder.Status.PARTIAL):
        raise ValidationError({'status': 'Only ordered or partially received POs can receive stock.'})
    if not lines:
        raise ValidationError({'items': 'Select at least one received item.'})
    qty_by_id = {}
    for line in lines:
        item_id, quantity = line['item'], line['quantity']
        if item_id in qty_by_id or type(quantity) is not int or not 1 <= quantity <= 1000000:
            raise ValidationError({'items': 'Invalid or duplicate receipt line.'})
        qty_by_id[item_id] = quantity
    # Lock all PO line rows before checking remaining quantities.
    items = list(PurchaseOrderItem.objects.select_for_update()
                 .filter(purchase_order=po).order_by('product_id'))
    by_id = {item.pk: item for item in items}
    if not set(qty_by_id).issubset(by_id):
        raise ValidationError({'items': 'An item does not belong to this purchase order.'})
    for item_id, quantity in qty_by_id.items():
        item = by_id[item_id]
        if quantity > item.remaining_quantity:
            raise ValidationError({
                'items': f'{item.product_id}: only {item.remaining_quantity} units remain to receive.'
            })
    receipt = PurchaseReceipt.objects.create(purchase_order=po, received_by=actor, note=note)
    for item in items:  # consistent product-lock order prevents cross-PO lock inversions
        quantity = qty_by_id.get(item.pk)
        if not quantity:
            continue
        try:
            movement = adjust_stock(
                product_id=item.product_id, movement_type='in', quantity=quantity, actor=actor,
                note=f'{po.number} receipt #{receipt.pk}' + (f' — {note}' if note else ''),
            )
        except Product.DoesNotExist:
            raise ValidationError({'items': 'A purchase item product is no longer active.'})
        movement.purchase_order = po
        movement.purchase_receipt = receipt
        movement.save(update_fields=['purchase_order', 'purchase_receipt'])
        item.received_quantity += quantity
        item.save(update_fields=['received_quantity'])
    po.status = (PurchaseOrder.Status.RECEIVED if all(i.remaining_quantity == 0 for i in items)
                 else PurchaseOrder.Status.PARTIAL)
    po.save(update_fields=['status', 'updated_at'])
    return po


@transaction.atomic
def cancel_purchase_order(*, po_id):
    po = get_object_or_404(PurchaseOrder.objects.select_for_update(), pk=po_id)
    if po.status not in (PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.ORDERED):
        raise ValidationError({'status': 'A received or cancelled PO cannot be cancelled.'})
    if po.items.filter(received_quantity__gt=0).exists():
        raise ValidationError({'status': 'A PO with received stock cannot be cancelled.'})
    po.status = PurchaseOrder.Status.CANCELLED
    po.save(update_fields=['status', 'updated_at'])
    return po


class PurchaseOrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                           mixins.CreateModelMixin, viewsets.GenericViewSet):
    permission_classes = [PurchaseOrderPermission]
    serializer_class = PurchaseOrderSerializer
    queryset = (PurchaseOrder.objects.select_related('supplier', 'created_by')
                .prefetch_related(
                    Prefetch('items', queryset=PurchaseOrderItem.objects.select_related('product')),
                    Prefetch('receipts', queryset=PurchaseReceipt.objects.select_related('received_by')
                             .prefetch_related('stock_movements__product')),
                ))

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get('search', '').strip()
        if q:
            qs = qs.filter(Q(number__icontains=q) | Q(supplier__name__icontains=q))
        state = self.request.query_params.get('status', '').strip()
        if state:
            qs = qs.filter(status=state)
        return qs

    @extend_schema(request=PurchaseCreateSerializer, responses={201: PurchaseOrderSerializer},
                   summary='Create a draft supplier purchase order')
    def create(self, request, *args, **kwargs):
        data = PurchaseCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        po = create_purchase_order(
            supplier=data.validated_data['supplier'], lines=data.validated_data['items'],
            actor=request.user, notes=data.validated_data.get('notes', ''),
        )
        return Response(self.get_serializer(po).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses=PurchaseOrderSerializer,
                   summary='Place a draft supplier purchase order')
    @action(detail=True, methods=['post'])
    def place(self, request, pk=None):
        self.get_object()
        po = place_purchase_order(po_id=pk)
        return Response(self.get_serializer(po).data)

    @extend_schema(request=PurchaseReceiveSerializer, responses=PurchaseOrderSerializer,
                   summary='Receive ordered stock into audited inventory')
    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        self.get_object()
        data = PurchaseReceiveSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        po = receive_purchase_order(po_id=pk, lines=data.validated_data['items'],
                                    actor=request.user, note=data.validated_data.get('note', ''))
        return Response(self.get_serializer(po).data)

    @extend_schema(request=None, responses=PurchaseOrderSerializer,
                   summary='Cancel an unreceived draft or ordered purchase order')
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        self.get_object()
        po = cancel_purchase_order(po_id=pk)
        return Response(self.get_serializer(po).data)

    @extend_schema(
        request=None, responses={(200, 'application/pdf'): OpenApiTypes.BINARY},
        summary='View or download a goods received note (PDF)',
    )
    @action(detail=True, methods=['get'], url_path=r'receipts/(?P<receipt_id>[0-9]+)/pdf')
    def receipt_pdf(self, request, pk=None, receipt_id=None):
        po = self.get_object()
        receipt = get_object_or_404(
            PurchaseReceipt.objects.select_related('received_by'),
            pk=receipt_id, purchase_order_id=po.pk,
        )
        document = build_goods_received_note(po, receipt)
        return FileResponse(
            BytesIO(document), content_type='application/pdf',
            as_attachment=request.query_params.get('download') == '1',
            filename=f'GRN_{po.number}_{receipt.pk}.pdf',
        )
