from datetime import date, timedelta
from django.db.models import Count, F, Q, Sum, DecimalField, ExpressionWrapper
from django.db.models.deletion import ProtectedError
from django.db.models.functions import TruncDate
from rest_framework import status, viewsets, mixins
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Category, Supplier, Product, Customer, Order, OrderItem, StockMovement
from .serializers import (CategorySerializer, SupplierSerializer, ProductSerializer,
                          CustomerSerializer, OrderSerializer, OrderCreateSerializer,
                          StockMovementSerializer, StockAdjustSerializer,
                          DashboardResponseSerializer, ReportsResponseSerializer,
                          HealthResponseSerializer)
from .services import adjust_stock, place_order, change_order_status

from drf_spectacular.utils import extend_schema

ADMIN_MANAGER = ('admin', 'manager')
OPERATORS = ('admin', 'manager', 'staff')

class RolePermission(BasePermission):
    """All logged-in users may read catalog; staff may transact; management may configure."""
    def has_permission(self, request, view):
        if not request.user.is_authenticated: return False
        allowed = getattr(view, 'write_roles', ADMIN_MANAGER)
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            read_roles = getattr(view, 'read_roles', None)
            return read_roles is None or request.user.is_superuser or request.user.role in read_roles
        return request.user.is_superuser or request.user.role in allowed

class ProtectedDeleteMixin:
    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError({'detail': 'This record is in use and cannot be deleted.'})

class CategoryViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [RolePermission]
    write_roles = ADMIN_MANAGER

class SupplierViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    read_roles = OPERATORS
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [RolePermission]
    write_roles = ADMIN_MANAGER
    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get('search', '').strip()
        return qs.filter(Q(name__icontains=q) | Q(email__icontains=q)) if q else qs

class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [RolePermission]
    write_roles = ADMIN_MANAGER

    def get_queryset(self):
        qs = Product.objects.select_related('category', 'supplier')
        if self.request.query_params.get('include_inactive') != 'true':
            qs = qs.filter(is_active=True)
        q = self.request.query_params.get('search', '').strip()
        if q: qs = qs.filter(Q(name__icontains=q) | Q(sku__icontains=q) | Q(description__icontains=q))
        category = self.request.query_params.get('category')
        if category:
            if not category.isdigit(): raise ValidationError({'category': 'Expected category ID.'})
            qs = qs.filter(category_id=int(category))
        stock = self.request.query_params.get('stock')
        if stock == 'low': qs = qs.filter(stock__gt=0, stock__lte=F('low_stock_threshold'))
        if stock == 'out': qs = qs.filter(stock=0)
        if stock == 'healthy': qs = qs.filter(stock__gt=F('low_stock_threshold'))
        return qs.order_by('-created_at')

    def perform_destroy(self, instance):
        # Soft-delete preserves order history; stock cannot be directly modified through product PATCH.
        if instance.stock:
            raise ValidationError({'detail': 'Move remaining stock out before archiving this product.'})
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])

class CustomerViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    read_roles = OPERATORS
    serializer_class = CustomerSerializer
    permission_classes = [RolePermission]
    write_roles = OPERATORS

    def get_queryset(self):
        qs = Customer.objects.annotate(total_orders=Count('orders'))
        q = self.request.query_params.get('search', '').strip()
        return qs.filter(Q(name__icontains=q) | Q(email__icontains=q) | Q(phone__icontains=q)) if q else qs

class StockMovementViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    read_roles = OPERATORS
    serializer_class = StockMovementSerializer
    permission_classes = [RolePermission]
    queryset = StockMovement.objects.select_related('product', 'performed_by', 'order')

    def get_queryset(self):
        qs = super().get_queryset()
        product = self.request.query_params.get('product')
        if product:
            if not product.isdigit(): raise ValidationError({'product': 'Expected product ID.'})
            qs = qs.filter(product_id=int(product))
        return qs

class StockAdjustView(APIView):
    permission_classes = [IsAuthenticated]
    @extend_schema(
        request=StockAdjustSerializer,
        responses={201: StockMovementSerializer},
        summary='Receive or remove stock',
    )

    def post(self, request):
        if request.user.role not in OPERATORS and not request.user.is_superuser:
            return Response({'detail': 'Insufficient permission.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = StockAdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        movement = adjust_stock(product_id=data['product'].pk, movement_type=data['movement_type'],
                                quantity=data['quantity'], actor=request.user, note=data.get('note', ''))
        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)

class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    queryset = Order.objects.select_related('customer', 'created_by').prefetch_related('items__product')

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == 'user' and not self.request.user.is_superuser:
            return qs.none()  # ordinary users do not see customer sales data
        q = self.request.query_params.get('search', '').strip()
        if q: qs = qs.filter(Q(number__icontains=q) | Q(customer__name__icontains=q))
        state = self.request.query_params.get('status', '').strip()
        if state: qs = qs.filter(status=state)
        return qs

    def list(self, request, *args, **kwargs):
        if request.user.role == 'user' and not request.user.is_superuser:
            return Response({'detail': 'Insufficient permission.'}, status=403)
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        if request.user.role == 'user' and not request.user.is_superuser:
            return Response({'detail': 'Insufficient permission.'}, status=403)
        return super().retrieve(request, *args, **kwargs)

    def create(self, request):
        if request.user.role not in OPERATORS and not request.user.is_superuser:
            return Response({'detail': 'Insufficient permission.'}, status=403)
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        order = place_order(customer=data['customer'], lines=data['items'], actor=request.user,
                            notes=data.get('notes', ''))
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def fulfill(self, request, pk=None):
        if request.user.role not in OPERATORS and not request.user.is_superuser:
            return Response({'detail': 'Insufficient permission.'}, status=403)
        order = self.get_object()
        return Response(OrderSerializer(change_order_status(order_id=order.pk, status='fulfilled', actor=request.user)).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        if request.user.role not in ADMIN_MANAGER and not request.user.is_superuser:
            return Response({'detail': 'Only managers and admins can cancel orders.'}, status=403)
        order = self.get_object()
        return Response(OrderSerializer(change_order_status(order_id=order.pk, status='cancelled', actor=request.user)).data)

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]
    
    @extend_schema(responses=DashboardResponseSerializer, summary='Dashboard statistics')

    def get(self, request):
        if request.user.role == 'user' and not request.user.is_superuser:
            return Response({'detail': 'Insufficient permission.'}, status=403)
        active = Product.objects.filter(is_active=True)
        sold = Order.objects.exclude(status='cancelled')
        low = active.filter(stock__lte=F('low_stock_threshold'))
        valuation = active.aggregate(value=Sum(ExpressionWrapper(F('stock') * F('cost'),
                          output_field=DecimalField(max_digits=18, decimal_places=2))))['value'] or 0
        sales = sold.aggregate(total=Sum('total'))['total'] or 0
        recent = Order.objects.select_related('customer', 'created_by').prefetch_related('items__product')[:5]
        series = list(sold.filter(created_at__date__gte=date.today()-timedelta(days=6))
            .annotate(day=TruncDate('created_at')).values('day')
            .annotate(sales=Sum('total'), orders=Count('id')).order_by('day'))
        mapped = {str(row['day']): row for row in series}
        trend = [{'date': str(day), 'sales': mapped.get(str(day), {}).get('sales', 0),
                  'orders': mapped.get(str(day), {}).get('orders', 0)}
                 for day in (date.today()-timedelta(days=i) for i in range(6,-1,-1))]
        return Response({
            'total_products': active.count(), 'total_customers': Customer.objects.count(),
            'stock_units': active.aggregate(total=Sum('stock'))['total'] or 0,
            'low_stock_count': low.count(), 'total_orders': sold.count(),
            'total_sales': sales, 'stock_value': valuation, 'sales_trend': trend,
            'recent_orders': OrderSerializer(recent, many=True).data,
            'low_stock_products': ProductSerializer(low.select_related('category','supplier').order_by('stock')[:6], many=True).data,
        })

class ReportsView(APIView):
    permission_classes = [IsAuthenticated]
    
    @extend_schema(responses=ReportsResponseSerializer, summary='Sales and inventory reports')

    def get(self, request):
        if request.user.role not in ADMIN_MANAGER and not request.user.is_superuser:
            return Response({'detail': 'Insufficient permission.'}, status=403)
        today = date.today()
        try:
            start = date.fromisoformat(request.query_params.get('start', str(today-timedelta(days=29))))
            end = date.fromisoformat(request.query_params.get('end', str(today)))
        except ValueError:
            raise ValidationError('Use ISO dates YYYY-MM-DD.')
        if start > end or (end-start).days > 366:
            raise ValidationError('Invalid report range (max 366 days).')
        valid = Order.objects.exclude(status='cancelled').filter(created_at__date__range=(start,end))
        totals = valid.aggregate(sales=Sum('total'), count=Count('id'))
        trend = list(valid.annotate(day=TruncDate('created_at')).values('day')
                     .annotate(sales=Sum('total'), orders=Count('id')).order_by('day'))
        top = list(OrderItem.objects.filter(order__in=valid).values('product__name','product__sku')
                   .annotate(units=Sum('quantity'), revenue=Sum(F('quantity')*F('unit_price'),
                       output_field=DecimalField(max_digits=18, decimal_places=2)))
                   .order_by('-units')[:8])
        by_category = list(Product.objects.filter(is_active=True).values('category__name')
                          .annotate(units=Sum('stock'), product_count=Count('id')).order_by('-units'))
        active = Product.objects.filter(is_active=True)
        valuation = active.aggregate(value=Sum(F('stock')*F('cost'),
                     output_field=DecimalField(max_digits=18, decimal_places=2)))['value'] or 0
        return Response({'start': start, 'end': end, 'sales': totals['sales'] or 0,
                         'orders': totals['count'] or 0, 'average_order_value':
                         (totals['sales'] or 0) / totals['count'] if totals['count'] else 0,
                         'stock_value': valuation, 'sales_trend': trend,
                         'top_products': top, 'category_stock': by_category,
                         'low_stock_count': active.filter(stock__lte=F('low_stock_threshold')).count()})

class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    
    @extend_schema(responses=HealthResponseSerializer, summary='Public API health check')
    def get(self, request):
        return Response({'status': 'ok', 'service': 'smartstock-api'})
