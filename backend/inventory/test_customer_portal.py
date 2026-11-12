"""Regression tests for customer account ownership and private billing resources."""
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from inventory.models import Category, Product, Customer, Order, OrderItem, Payment


class CustomerPortalTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.customer_user = User.objects.create_user(
            username='buyer1', email='buyer1@example.com', password='SafePassword123!', role='user')
        cls.other_user = User.objects.create_user(
            username='buyer2', email='buyer2@example.com', password='SafePassword123!', role='user')
        cls.unlinked_user = User.objects.create_user(
            username='buyer3', email='buyer3@example.com', password='SafePassword123!', role='user')
        cls.staff = User.objects.create_user(
            username='counter', email='counter@example.com', password='SafePassword123!', role='staff')
        cls.first = Customer.objects.create(name='First Buyer', user=cls.customer_user)
        cls.second = Customer.objects.create(name='Second Buyer', user=cls.other_user)
        category = Category.objects.create(name='Peripherals')
        cls.product = Product.objects.create(
            name='Mouse', sku='PRIVATE-01', category=category,
            price=Decimal('500.00'), cost=Decimal('200.00'), stock=10)
        cls.inactive_product = Product.objects.create(
            name='Archived', sku='PRIVATE-02', category=category,
            price=Decimal('100.00'), cost=Decimal('10.00'), stock=0, is_active=False)
        cls.own_order = Order.objects.create(
            number='SS-MY-001', customer=cls.first,
            total=Decimal('1000.00'), created_by=cls.staff)
        cls.other_order = Order.objects.create(
            number='SS-MY-002', customer=cls.second,
            total=Decimal('500.00'), created_by=cls.staff)
        OrderItem.objects.create(
            order=cls.own_order, product=cls.product,
            quantity=2, unit_price=Decimal('500.00'))
        OrderItem.objects.create(
            order=cls.other_order, product=cls.product,
            quantity=1, unit_price=Decimal('500.00'))
        Payment.objects.create(order=cls.own_order, amount=Decimal('100.00'),
                               method='cash', reference='INTERNAL-RECEIPT', recorded_by=cls.staff)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.customer_user)

    def test_private_order_list_and_detail(self):
        res = self.client.get('/api/my/orders/')
        self.assertEqual(res.status_code, 200)
        rows = res.data['results'] if isinstance(res.data, dict) else res.data
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['number'], 'SS-MY-001')
        self.assertNotIn('created_by_name', rows[0])
        self.assertNotIn('notes', rows[0])
        self.assertEqual(self.client.get(f'/api/my/orders/{self.own_order.pk}/').status_code, 200)
        self.assertEqual(self.client.get(f'/api/my/orders/{self.other_order.pk}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/orders/{self.own_order.pk}/').status_code, 403)

    def test_unlinked_customer_sees_no_orders(self):
        self.client.force_authenticate(self.unlinked_user)
        res = self.client.get('/api/my/orders/')
        rows = res.data['results'] if isinstance(res.data, dict) else res.data
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(rows), 0)
        self.assertEqual(self.client.get(f'/api/my/orders/{self.own_order.pk}/').status_code, 404)

    def test_customer_catalog_does_not_expose_cost_or_quantity(self):
        res = self.client.get('/api/products/?include_inactive=true')
        self.assertEqual(res.status_code, 200)
        rows = res.data['results'] if isinstance(res.data, dict) else res.data
        self.assertEqual(len(rows), 1)
        self.assertNotIn('cost', rows[0])
        self.assertNotIn('stock', rows[0])
        self.assertNotIn('supplier', rows[0])
        self.assertIn('price', rows[0])
        self.assertEqual(self.client.post('/api/products/', {'name': 'Hack'}).status_code, 403)

    def test_invoice_is_owned(self):
        own = self.client.get(f'/api/orders/{self.own_order.pk}/invoice/')
        self.assertEqual(own.status_code, 200)
        self.assertEqual(own['Content-Type'], 'application/pdf')
        self.assertEqual(self.client.get(f'/api/orders/{self.other_order.pk}/invoice/').status_code, 404)

    def test_payment_history_is_owned_and_redacted(self):
        own = self.client.get(f'/api/orders/{self.own_order.pk}/payments/')
        self.assertEqual(own.status_code, 200)
        self.assertEqual(own.data['payment_status'], 'partial')
        self.assertEqual(own.data['paid_amount'], '100.00')
        self.assertNotIn('reference', own.data['payments'][0])
        self.assertEqual(self.client.get(f'/api/orders/{self.other_order.pk}/payments/').status_code, 404)
        self.assertEqual(self.client.post(f'/api/orders/{self.own_order.pk}/payments/',
                                          {'amount': '10.00', 'method': 'cash'}).status_code, 403)

    def test_customers_cannot_initiate_or_verify_gateway_payments(self):
        # Customer accounts are strictly read-only, even for their own order.
        for order_id in (self.own_order.pk, self.other_order.pk):
            self.assertEqual(self.client.post(f'/api/orders/{order_id}/razorpay/start/').status_code, 403)
            self.assertEqual(self.client.post(f'/api/orders/{order_id}/razorpay/verify/', {}).status_code, 403)

    def test_customers_cannot_cancel_or_adjust_stock(self):
        self.assertEqual(self.client.post(f'/api/orders/{self.own_order.pk}/cancel/').status_code, 403)
        self.assertEqual(self.client.post('/api/inventory/adjust/',
                           {'product': self.product.pk, 'movement_type': 'in', 'quantity': 3}).status_code, 403)
        self.assertEqual(self.client.get('/api/customers/').status_code, 403)
        self.assertEqual(self.client.get('/api/reports/').status_code, 403)

    def test_unauthenticated_and_staff_denied_customer_private_endpoints(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get('/api/my/orders/').status_code, 401)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get('/api/my/orders/').status_code, 403)
