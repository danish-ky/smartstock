"""Read-only inventory alerts and simple historical sales-run-rate estimates.

No stock mutations or fake demand: only non-cancelled customer order lines
within the lookback window contribute to the demand estimate. A missing
recent sales rate results in unknown coverage, not an invented prediction.
"""

from datetime import datetime, time, timedelta
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP

from django.db.models import F, IntegerField, Sum
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Order, OrderItem, Product, PurchaseOrder, PurchaseOrderItem


class ForecastProductSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    sku = serializers.CharField()
    category_name = serializers.CharField()
    stock = serializers.IntegerField()
    on_order_units = serializers.IntegerField()
    low_stock_threshold = serializers.IntegerField()
    alert = serializers.ChoiceField(choices=['out', 'low', 'at_risk', 'healthy'])
    recent_units_sold = serializers.IntegerField()
    average_daily_sales = serializers.FloatField()
    days_remaining = serializers.FloatField(allow_null=True)
    lead_time_demand = serializers.IntegerField()
    suggested_reorder = serializers.IntegerField()
    has_recent_sales = serializers.BooleanField()


class ForecastResponseSerializer(serializers.Serializer):
    as_of = serializers.DateField()
    history_days = serializers.IntegerField()
    lead_days = serializers.IntegerField()
    target_days = serializers.IntegerField()
    products_analyzed = serializers.IntegerField()
    out_of_stock_count = serializers.IntegerField()
    low_stock_count = serializers.IntegerField()
    forecast_risk_count = serializers.IntegerField()
    reorder_count = serializers.IntegerField()
    products = ForecastProductSerializer(many=True)
    methodology = serializers.CharField()


def _positive_int(request, name, default, maximum):
    raw = request.query_params.get(name)
    if raw is None:
        return default
    if not raw.isascii() or not raw.isdecimal():
        raise ValidationError({name: f'Enter a whole number from 1 to {maximum}.'})
    value = int(raw)
    if not 1 <= value <= maximum:
        raise ValidationError({name: f'Enter a whole number from 1 to {maximum}.'})
    return value


def _ceil_nonnegative(value):
    return int(value.to_integral_value(rounding=ROUND_CEILING))


def build_inventory_forecast(*, history_days=30, lead_days=7, target_days=14,
                             limit=25, as_of=None):
    """Compute actionable restock hints; never write products or movements.

    Formula: daily rate = quantity on non-cancelled orders / history_days.
    Target stock = max(product minimum threshold, rounded-up demand during
    lead time + additional target cover days). Existing and already ordered
    (not yet received) stock are subtracted from new reorder suggestions.
    This is a basic deterministic estimate, not a guarantee or ML forecast.
    """
    today = as_of or timezone.localdate()
    start = today - timedelta(days=history_days - 1)
    start_dt = datetime.combine(start, time.min)
    end_dt = datetime.combine(today + timedelta(days=1), time.min)
    if timezone.is_aware(timezone.now()):
        tz = timezone.get_current_timezone()
        start_dt = timezone.make_aware(start_dt, tz)
        end_dt = timezone.make_aware(end_dt, tz)

    units_by_product = dict(
        OrderItem.objects.filter(
            order__status__in=[Order.Status.PLACED, Order.Status.FULFILLED],
            order__created_at__gte=start_dt,
            order__created_at__lt=end_dt,
            product__is_active=True,
        ).values('product_id').annotate(units=Sum('quantity'))
        .values_list('product_id', 'units')
    )

    pending_by_product = dict(
        PurchaseOrderItem.objects.filter(
            purchase_order__status__in=[PurchaseOrder.Status.ORDERED, PurchaseOrder.Status.PARTIAL],
            product__is_active=True,
        ).values('product_id').annotate(
            outstanding=Sum(F('quantity') - F('received_quantity'), output_field=IntegerField()),
        ).values_list('product_id', 'outstanding')
    )

    products = []
    counts = {'out': 0, 'low': 0, 'at_risk': 0}
    reorder_count = 0
    total_analyzed = 0
    for product in Product.objects.filter(is_active=True).select_related('category').order_by('pk'):
        total_analyzed += 1
        sold = int(units_by_product.get(product.pk, 0) or 0)
        daily_rate = Decimal(sold) / Decimal(history_days)
        lead_demand = _ceil_nonnegative(daily_rate * lead_days)
        target_demand = _ceil_nonnegative(daily_rate * (lead_days + target_days))
        target_stock = max(product.low_stock_threshold, target_demand)
        on_order = max(0, int(pending_by_product.get(product.pk, 0) or 0))
        suggested = max(0, target_stock - product.stock - on_order)
        coverage = (float((Decimal(product.stock) / daily_rate).quantize(
            Decimal('0.1'), rounding=ROUND_HALF_UP)) if sold else None)

        if product.stock == 0:
            alert = 'out'
        elif product.stock <= product.low_stock_threshold:
            alert = 'low'
        elif sold and product.stock <= lead_demand:
            alert = 'at_risk'
        else:
            alert = 'healthy'
        if alert in counts:
            counts[alert] += 1
        if suggested > 0:
            reorder_count += 1
        if suggested == 0 and alert == 'healthy':
            continue
        products.append({
            'id': product.pk,
            'name': product.name,
            'sku': product.sku,
            'category_name': product.category.name,
            'stock': product.stock,
            'on_order_units': on_order,
            'low_stock_threshold': product.low_stock_threshold,
            'alert': alert,
            'recent_units_sold': sold,
            'average_daily_sales': float(daily_rate.quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)),
            'days_remaining': coverage,
            'lead_time_demand': lead_demand,
            'suggested_reorder': suggested,
            'has_recent_sales': sold > 0,
        })

    priority = {'out': 0, 'low': 1, 'at_risk': 2, 'healthy': 3}
    products.sort(key=lambda p: (priority[p['alert']], -p['suggested_reorder'], p['sku']))

    return {
        'as_of': today.isoformat(),
        'history_days': history_days,
        'lead_days': lead_days,
        'target_days': target_days,
        'products_analyzed': total_analyzed,
        'out_of_stock_count': counts['out'],
        'low_stock_count': counts['low'] + counts['out'],
        'forecast_risk_count': counts['at_risk'],
        'reorder_count': reorder_count,
        'products': products[:limit],
        'methodology': (
            'Estimate: units sold on non-cancelled orders in the lookback window / days in window. '
            'Suggested reorder uses lead time plus target cover, a configured minimum, and unreceived placed PO quantities. '
            'No recent sales means unknown days remaining. Not a guaranteed demand prediction.'
        ),
    }


class InventoryForecastView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary='Low-stock alerts and historical sales-rate replenishment estimates',
        parameters=[
            OpenApiParameter('history_days', OpenApiTypes.INT, description='Sales lookback, 1–90 days; default 30'),
            OpenApiParameter('lead_days', OpenApiTypes.INT, description='Assumed delivery lead, 1–60 days; default 7'),
            OpenApiParameter('target_days', OpenApiTypes.INT, description='Additional stock cover, 1–90 days; default 14'),
            OpenApiParameter('limit', OpenApiTypes.INT, description='Maximum recommended products, 1–100; default 25'),
        ],
        responses={200: ForecastResponseSerializer},
    )
    def get(self, request):
        if not (request.user.is_superuser or request.user.role in ('admin', 'manager', 'staff')):
            return Response({'detail': 'Only inventory operators can view forecasts.'}, status=403)
        params = {
            'history_days': _positive_int(request, 'history_days', 30, 90),
            'lead_days': _positive_int(request, 'lead_days', 7, 60),
            'target_days': _positive_int(request, 'target_days', 14, 90),
            'limit': _positive_int(request, 'limit', 25, 100),
        }
        return Response(build_inventory_forecast(**params))
