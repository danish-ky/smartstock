from django.contrib import admin
from .models import Category, Supplier, Customer, Product, Order, OrderItem, StockMovement

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'sku', 'category', 'price', 'stock', 'low_stock_threshold', 'is_active')
    search_fields = ('name', 'sku')
    list_filter = ('category', 'is_active')
    readonly_fields = ('stock',)

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    readonly_fields = ('product','quantity','unit_price')

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('number','customer','status','total','created_at')
    inlines = [OrderItemInline]
    readonly_fields = ('number','customer','status','total','notes','created_by','created_at','updated_at')
    def has_add_permission(self, request): return False
    def has_delete_permission(self, request, obj=None): return False

@admin.register(StockMovement)
class MovementAdmin(admin.ModelAdmin):
    list_display = ('product','movement_type','quantity','order','created_at')
    readonly_fields = ('product','movement_type','quantity','order','note','performed_by','created_at')
    def has_add_permission(self, request): return False
    def has_delete_permission(self, request, obj=None): return False

@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('name', 'email', 'phone', 'user')
    search_fields = ('name', 'email', 'phone', 'user__username')
    autocomplete_fields = ('user',)

admin.site.register([Category, Supplier])
