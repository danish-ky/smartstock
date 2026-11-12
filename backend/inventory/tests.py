from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from inventory.models import Category, Product, Customer, Order, StockMovement

class InventoryAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='admin1',email='admin1@example.com',
                    password='LongTestPass123!',role='admin')
        cls.staff = get_user_model().objects.create_user(username='staff1',email='staff1@example.com',
                    password='LongTestPass123!',role='staff')
        cls.regular = get_user_model().objects.create_user(username='user1',email='user1@example.com',
                    password='LongTestPass123!',role='user')
        cls.category = Category.objects.create(name='Test Category')
        cls.product = Product.objects.create(name='Test Widget',sku='TST-001',category=cls.category,
                       price=Decimal('12.50'),cost=Decimal('5.00'),stock=10,low_stock_threshold=3)
        cls.customer = Customer.objects.create(name='Test Buyer')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_login_and_unauthorized(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get('/api/products/').status_code, 401)
        self.assertEqual(self.client.post('/api/auth/login/', {'username':'admin1','password':'LongTestPass123!'}).status_code,200)

    def test_duplicate_sku(self):
        response = self.client.post('/api/products/',{'name':'Duplicate','sku':'TST-001','category':self.category.id,'price':'5.00'})
        self.assertEqual(response.status_code,400)

    def test_role_enforcement(self):
        self.client.force_authenticate(user=self.regular)
        self.assertEqual(self.client.post('/api/inventory/adjust/',{'product':self.product.id,'movement_type':'out','quantity':1}).status_code,403)
        self.assertEqual(self.client.post('/api/products/',{'name':'No','sku':'NO-001','category':self.category.id,'price':'5.00'}).status_code,403)
        self.assertEqual(self.client.get('/api/reports/').status_code,403)
        self.client.force_authenticate(user=self.staff)
        self.assertEqual(self.client.get('/api/products/').status_code,200)
        self.assertEqual(self.client.post('/api/products/',{'name':'No','sku':'NO-001','category':self.category.id,'price':'5.00'}).status_code,403)

    def test_order_deduct_cancel_and_audit(self):
        response = self.client.post('/api/orders/', {'customer':self.customer.pk,'items':[{'product':self.product.pk,'quantity':4}]},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock,6)
        self.assertEqual(StockMovement.objects.filter(movement_type='sale').count(),1)
        order_id = response.data['id']
        self.assertEqual(self.client.post(f'/api/orders/{order_id}/cancel/').status_code,200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock,10)
        self.assertEqual(self.client.post(f'/api/orders/{order_id}/cancel/').status_code,400)

    def test_no_negative_stock(self):
        res = self.client.post('/api/inventory/adjust/',{'product':self.product.pk,'movement_type':'out','quantity':100})
        self.assertEqual(res.status_code,400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock,10)
        res = self.client.post('/api/orders/',{'customer':self.customer.pk,'items':[{'product':self.product.pk,'quantity':20}]},format='json')
        self.assertEqual(res.status_code,400)
        self.assertEqual(Order.objects.count(),0)

    def test_stock_is_read_only_through_product_api(self):
        res = self.client.patch(f'/api/products/{self.product.pk}/',{'stock':500},format='json')
        self.assertEqual(res.status_code,200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock,10)

    def test_dashboard_and_reports(self):
        self.assertEqual(self.client.get('/api/dashboard/').status_code,200)
        self.assertEqual(self.client.get('/api/reports/').status_code,200)
