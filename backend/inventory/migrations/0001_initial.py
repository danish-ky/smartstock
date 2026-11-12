# Initial migration for SmartStock catalog, orders and audit transactions.
from decimal import Decimal
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name='Category',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('name',models.CharField(max_length=120,unique=True)),
            ('description',models.TextField(blank=True)),
            ('created_at',models.DateTimeField(auto_now_add=True)),
        ],options={'ordering':['name']}),
        migrations.CreateModel(name='Supplier',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('name',models.CharField(max_length=160)),
            ('email',models.EmailField(blank=True,max_length=254)),
            ('phone',models.CharField(blank=True,max_length=30)),
            ('address',models.TextField(blank=True)),
            ('created_at',models.DateTimeField(auto_now_add=True)),
        ],options={'ordering':['name']}),
        migrations.CreateModel(name='Customer',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('name',models.CharField(db_index=True,max_length=160)),
            ('email',models.EmailField(blank=True,max_length=254)),
            ('phone',models.CharField(blank=True,max_length=30)),
            ('address',models.TextField(blank=True)),
            ('created_at',models.DateTimeField(auto_now_add=True)),
        ],options={'ordering':['-created_at']}),
        migrations.CreateModel(name='Product',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('name',models.CharField(db_index=True,max_length=180)),
            ('sku',models.CharField(max_length=64,unique=True)),
            ('description',models.TextField(blank=True)),
            ('price',models.DecimalField(decimal_places=2,max_digits=12,validators=[MinValueValidator(Decimal('0.00'))])),
            ('cost',models.DecimalField(decimal_places=2,default=0,max_digits=12,validators=[MinValueValidator(Decimal('0.00'))])),
            ('stock',models.PositiveIntegerField(default=0)),
            ('low_stock_threshold',models.PositiveIntegerField(default=10)),
            ('is_active',models.BooleanField(default=True)),
            ('created_at',models.DateTimeField(auto_now_add=True)),
            ('updated_at',models.DateTimeField(auto_now=True)),
            ('category',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='products',to='inventory.category')),
            ('supplier',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name='products',to='inventory.supplier')),
        ],options={'ordering':['-created_at']}),
        migrations.CreateModel(name='Order',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('number',models.CharField(blank=True,max_length=25,null=True,unique=True)),
            ('status',models.CharField(choices=[('placed','Placed'),('fulfilled','Fulfilled'),('cancelled','Cancelled')],default='placed',max_length=12)),
            ('total',models.DecimalField(decimal_places=2,default=0,max_digits=14,validators=[MinValueValidator(Decimal('0.00'))])),
            ('notes',models.TextField(blank=True)),
            ('created_at',models.DateTimeField(auto_now_add=True)),
            ('updated_at',models.DateTimeField(auto_now=True)),
            ('created_by',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='orders_created',to=settings.AUTH_USER_MODEL)),
            ('customer',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='orders',to='inventory.customer')),
        ],options={'ordering':['-created_at']}),
        migrations.CreateModel(name='OrderItem',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('quantity',models.PositiveIntegerField(validators=[MinValueValidator(1)])),
            ('unit_price',models.DecimalField(decimal_places=2,max_digits=12,validators=[MinValueValidator(Decimal('0.00'))])),
            ('order',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='items',to='inventory.order')),
            ('product',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='order_items',to='inventory.product')),
        ]),
        migrations.CreateModel(name='StockMovement',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('movement_type',models.CharField(choices=[('in','Stock In'),('out','Stock Out'),('sale','Order Sale'),('return','Order Return')],max_length=8)),
            ('quantity',models.PositiveIntegerField(validators=[MinValueValidator(1)])),
            ('note',models.CharField(blank=True,max_length=240)),
            ('created_at',models.DateTimeField(auto_now_add=True)),
            ('order',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='movements',to='inventory.order')),
            ('performed_by',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='stock_movements',to=settings.AUTH_USER_MODEL)),
            ('product',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='movements',to='inventory.product')),
        ],options={'ordering':['-created_at']}),
        migrations.AddIndex(model_name='product',index=models.Index(fields=['category','name'],name='inventory_p_categ_name_idx')),
        migrations.AddIndex(model_name='product',index=models.Index(fields=['stock'],name='inventory_p_stock_idx')),
        migrations.AddIndex(model_name='order',index=models.Index(fields=['status','created_at'],name='inventory_o_status_date_idx')),
        migrations.AddIndex(model_name='stockmovement',index=models.Index(fields=['product','-created_at'],name='inventory_m_product_date_idx')),
        migrations.AddConstraint(model_name='orderitem',constraint=models.UniqueConstraint(fields=('order','product'),name='one_product_per_order')),
    ]
