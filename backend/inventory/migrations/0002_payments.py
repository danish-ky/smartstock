from decimal import Decimal
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [('inventory', '0001_initial'), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name='Payment', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('amount', models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])),
            ('method', models.CharField(max_length=16, choices=[('cash','Cash'),('upi','UPI'),('card','Card'),('bank','Bank transfer'),('razorpay','Razorpay')])),
            ('reference', models.CharField(max_length=120, blank=True)),
            ('gateway_payment_id', models.CharField(max_length=120, null=True, blank=True, unique=True)),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('order', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='payments', to='inventory.order')),
            ('recorded_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, null=True, blank=True, to=settings.AUTH_USER_MODEL)),
        ], options={'ordering':['-created_at']}),
        migrations.AddIndex(model_name='payment', index=models.Index(fields=['order','-created_at'], name='inventory_pay_order_idx')),
        migrations.CreateModel(name='RazorpayAttempt', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('gateway_order_id', models.CharField(max_length=120, unique=True)),
            ('amount_paise', models.PositiveBigIntegerField()),
            ('status', models.CharField(max_length=12, default='created', choices=[('created','Created'),('paid','Paid')])),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('order', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='gateway_attempts', to='inventory.order')),
        ], options={'ordering':['-created_at']}),
    ]
