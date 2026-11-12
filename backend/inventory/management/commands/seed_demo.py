"""Optional development demo data; requires DEMO_ADMIN_PASSWORD for initial admin."""
import os
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from inventory.models import Category, Supplier, Product, Customer
from inventory.services import adjust_stock, place_order

class Command(BaseCommand):
    help = 'Populate a small development dataset. Will not overwrite existing records.'

    def handle(self, *args, **options):
        password = os.environ.get('DEMO_ADMIN_PASSWORD')
        if not password:
            raise CommandError('Set DEMO_ADMIN_PASSWORD in .env to a strong value first.')
        User = get_user_model()
        admin, made = User.objects.get_or_create(username='demo_admin', defaults={
            'email':'demo-admin@example.com','first_name':'Alex','last_name':'Morgan',
            'role':'admin','is_staff':True,'is_superuser':True})
        if made:
            admin.set_password(password)
            admin.save()
        categories = [Category.objects.get_or_create(name=name)[0] for name in
                      ['Electronics','Accessories','Office Supplies','Storage','Networking']]
        supplier, _ = Supplier.objects.get_or_create(name='Northline Distribution', defaults={
            'email':'supply@example.com','phone':'+1 555 0100'})
        catalog = [
            ('Wireless Headphones','AUD-1001',0,8999.00,4900.00,68,10),
            ('Mechanical Keyboard','KEY-2004',1,12999.00,7200.00,42,10),
            ('Ergonomic Mouse','MOU-3012',1,2499.00,1250.00,7,12),
            ('USB-C Hub 7-in-1','HUB-4021',0,3499.00,1750.00,34,8),
            ('Premium Notebook','OFF-5016',2,299.00,120.00,120,20),
            ('Portable SSD 1TB','SSD-6033',3,7999.00,4400.00,5,10),
            ('27-inch Monitor','MON-7067',0,17999.00,10500.00,18,5),
            ('Mesh Wi-Fi Router','NET-8050',4,11999.00,6800.00,0,8),
        ]
        for name, sku, cat, price, cost, stock, threshold in catalog:
            p, new = Product.objects.get_or_create(sku=sku, defaults={
                'name':name,'category':categories[cat],'supplier':supplier,
                'price':Decimal(str(price)),'cost':Decimal(str(cost)),
                'low_stock_threshold':threshold})
            if new and stock: adjust_stock(product_id=p.pk,movement_type='in',quantity=stock,
                                            actor=admin,note='Initial warehouse stock')
        customers = [Customer.objects.get_or_create(name=n, defaults={'email':e})[0] for n,e in [
            ('Olivia Bennett','olivia@example.com'), ('Ethan Walker','ethan@example.com'),
            ('Sophia Carter','sophia@example.com'), ('Liam Parker','liam@example.com'),
            ('Maya Patel','maya@example.com')]]
        if not admin.orders_created.exists():
            products = list(Product.objects.filter(stock__gte=6).order_by('id')[:3])
            if products:
                from inventory.models import Order, StockMovement
                for i in range(9):
                    chosen = products[i % len(products)]
                    placed = place_order(customer=customers[i % len(customers)],
                        lines=[{'product':chosen, 'quantity':(i % 3) + 1}],actor=admin)
                    when = timezone.now() - timedelta(days=i % 7, hours=i % 6)
                    Order.objects.filter(pk=placed.pk).update(created_at=when)
                    StockMovement.objects.filter(order=placed).update(created_at=when)
        self.stdout.write(self.style.SUCCESS('Demo data ready. Login username: demo_admin (password from your environment).'))
