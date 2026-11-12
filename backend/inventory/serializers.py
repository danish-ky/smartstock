from decimal import Decimal
from django.db.models import Sum
from rest_framework import serializers
from .models import Category, Supplier, Product, Customer, Order, OrderItem, StockMovement

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'
        read_only_fields = ('id', 'created_at')

class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'
        read_only_fields = ('id', 'created_at')

class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default='')
    stock_status = serializers.CharField(read_only=True)
    class Meta:
        model = Product
        fields = ('id','name','sku','description','category','category_name','supplier', 'supplier_name',
                  'price','cost','stock','low_stock_threshold','stock_status','is_active','created_at','updated_at')
        read_only_fields = ('id','stock','stock_status','created_at','updated_at')
    def validate_sku(self, value):
        return value.strip().upper()

    def validate(self, attrs):
        if self.instance and attrs.get('is_active') is False and self.instance.stock:
            raise serializers.ValidationError({'is_active': 'Move stock out before deactivating a product.'})
        return attrs

class CustomerSerializer(serializers.ModelSerializer):
    total_orders = serializers.IntegerField(read_only=True, default=0)
    class Meta:
        model = Customer
        fields = ('id','name','email','phone','address','created_at','total_orders')
        read_only_fields = ('id','created_at','total_orders')

class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    sku = serializers.CharField(source='product.sku', read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    class Meta:
        model = OrderItem
        fields = ('id','product','product_name','sku','quantity','unit_price','subtotal')

class OrderSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    items = OrderItemSerializer(many=True, read_only=True)
    paid_amount = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    def _paid(self, obj):
        if not hasattr(obj, '_cached_paid_amount'):
            obj._cached_paid_amount = obj.payments.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        return obj._cached_paid_amount
    def get_paid_amount(self, obj):
        return str(self._paid(obj))
    def get_payment_status(self, obj):
        amount = self._paid(obj)
        return 'paid' if amount >= obj.total else 'partial' if amount > 0 else 'unpaid'
    class Meta:
        model = Order
        fields = ('id','number','customer','customer_name','status','total','notes','items',
                  'created_by_name','created_at','updated_at','paid_amount','payment_status')

class OrderLineInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1, max_value=1000000)

class OrderCreateSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    items = OrderLineInputSerializer(many=True, allow_empty=False)
    def validate_items(self, value):
        ids = [row['product'].pk for row in value]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError('A product may appear only once per order.')
        return value

class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    performed_by_name = serializers.CharField(source='performed_by.username', read_only=True)
    class Meta:
        model = StockMovement
        fields = ('id','product','product_name','movement_type','quantity','note','order',
                  'performed_by_name','created_at')

class StockAdjustSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    movement_type = serializers.ChoiceField(choices=[('in','Stock In'),('out','Stock Out')])
    quantity = serializers.IntegerField(min_value=1, max_value=1000000)
    note = serializers.CharField(required=False, allow_blank=True, max_length=240)
    
    

# Explicit OpenAPI response schemas for APIView endpoints.
# These serializers document response shapes; they do not change API output.
class DashboardTrendResponseSerializer(serializers.Serializer):
    date = serializers.DateField()
    sales = serializers.DecimalField(max_digits=18, decimal_places=2)
    orders = serializers.IntegerField()


class ReportTrendResponseSerializer(serializers.Serializer):
    day = serializers.DateField()
    sales = serializers.DecimalField(max_digits=18, decimal_places=2)
    orders = serializers.IntegerField()


class TopProductResponseSerializer(serializers.Serializer):
    product__name = serializers.CharField()
    product__sku = serializers.CharField()
    units = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=18, decimal_places=2)

class CategoryStockResponseSerializer(serializers.Serializer):
    category__name = serializers.CharField(allow_null=True)
    units = serializers.IntegerField(allow_null=True)
    product_count = serializers.IntegerField()


class DashboardResponseSerializer(serializers.Serializer):
    total_products = serializers.IntegerField()
    total_customers = serializers.IntegerField()
    stock_units = serializers.IntegerField()
    low_stock_count = serializers.IntegerField()
    total_orders = serializers.IntegerField()
    total_sales = serializers.DecimalField(max_digits=18, decimal_places=2)
    stock_value = serializers.DecimalField(max_digits=18, decimal_places=2)
    sales_trend = DashboardTrendResponseSerializer(many=True)
    recent_orders = OrderSerializer(many=True)
    low_stock_products = ProductSerializer(many=True)


class ReportsResponseSerializer(serializers.Serializer):
    start = serializers.DateField()
    end = serializers.DateField()
    sales = serializers.DecimalField(max_digits=18, decimal_places=2)
    orders = serializers.IntegerField()
    average_order_value = serializers.DecimalField(max_digits=18, decimal_places=2)
    stock_value = serializers.DecimalField(max_digits=18, decimal_places=2)
    sales_trend = ReportTrendResponseSerializer(many=True)
    top_products = TopProductResponseSerializer(many=True)
    category_stock = CategoryStockResponseSerializer(many=True)
    low_stock_count = serializers.IntegerField()


class HealthResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    service = serializers.CharField()
