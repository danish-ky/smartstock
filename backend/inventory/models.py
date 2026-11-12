from decimal import Decimal
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

money_min = MinValueValidator(Decimal('0.00'))

class Category(models.Model):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['name']
    def __str__(self): return self.name

class Supplier(models.Model):
    name = models.CharField(max_length=160)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['name']
    def __str__(self): return self.name

class Product(models.Model):
    name = models.CharField(max_length=180, db_index=True)
    sku = models.CharField(max_length=64, unique=True)
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='products')
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL, related_name='products')
    price = models.DecimalField(max_digits=12, decimal_places=2, validators=[money_min])
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[money_min])
    stock = models.PositiveIntegerField(default=0)
    low_stock_threshold = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['category', 'name'], name='inventory_p_categ_name_idx'), models.Index(fields=['stock'], name='inventory_p_stock_idx')]
    @property
    def stock_status(self):
        if self.stock == 0: return 'out'
        return 'low' if self.stock <= self.low_stock_threshold else 'healthy'
    def __str__(self): return f'{self.name} ({self.sku})'

class Customer(models.Model):
    name = models.CharField(max_length=160, db_index=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['-created_at']
    def __str__(self): return self.name

class Order(models.Model):
    class Status(models.TextChoices):
        PLACED = 'placed', 'Placed'
        FULFILLED = 'fulfilled', 'Fulfilled'
        CANCELLED = 'cancelled', 'Cancelled'
    number = models.CharField(max_length=25, unique=True, null=True, blank=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='orders')
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PLACED)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0, validators=[money_min])
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='orders_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['status', 'created_at'], name='inventory_o_status_date_idx')]
    def __str__(self): return self.number or f'Order {self.pk}'

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='order_items')
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[money_min])
    class Meta:
        constraints = [models.UniqueConstraint(fields=['order', 'product'], name='one_product_per_order')]
    @property
    def subtotal(self): return self.unit_price * self.quantity

class StockMovement(models.Model):
    class Types(models.TextChoices):
        IN = 'in', 'Stock In'
        OUT = 'out', 'Stock Out'
        SALE = 'sale', 'Order Sale'
        RETURN = 'return', 'Order Return'
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='movements')
    movement_type = models.CharField(max_length=8, choices=Types.choices)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    note = models.CharField(max_length=240, blank=True)
    order = models.ForeignKey(Order, null=True, blank=True, on_delete=models.PROTECT, related_name='movements')
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='stock_movements')
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['product', '-created_at'], name='inventory_m_product_date_idx')]

class Payment(models.Model):
    """Auditable receipts. Payment records never change inventory quantities."""
    class Methods(models.TextChoices):
        CASH = 'cash', 'Cash'
        UPI = 'upi', 'UPI'
        CARD = 'card', 'Card'
        BANK = 'bank', 'Bank transfer'
        RAZORPAY = 'razorpay', 'Razorpay'
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name='payments')
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    method = models.CharField(max_length=16, choices=Methods.choices)
    reference = models.CharField(max_length=120, blank=True)
    gateway_payment_id = models.CharField(max_length=120, null=True, blank=True, unique=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['order', '-created_at'], name='inventory_pay_order_idx')]

class RazorpayAttempt(models.Model):
    """One gateway order per attempted checkout, for signature and amount reconciliation."""
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name='gateway_attempts')
    gateway_order_id = models.CharField(max_length=120, unique=True)
    amount_paise = models.PositiveBigIntegerField()
    status = models.CharField(max_length=12, default='created', choices=[('created','Created'),('paid','Paid')])
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['-created_at']
