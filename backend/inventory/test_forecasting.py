"""Forecast API tests: permissions, sale inclusion, cancellations and stock safety."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import (Category, Customer, Order, OrderItem, Product, StockMovement,
                     Supplier, PurchaseOrder, PurchaseOrderItem)

URL = '/api/inventory/forecast/'


class InventoryForecastTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        user = get_user_model()
        cls.admin = user.objects.create_user(username='forecast_admin', email='forecast_admin@example.com', password='Test123Strong!', role='admin')
        cls.manager = user.objects.create_user(username='forecast_manager', email='forecast_manager@example.com', password='Test123Strong!', role='manager')
        cls.staff = user.objects.create_user(username='forecast_staff', email='forecast_staff@example.com', password='Test123Strong!', role='staff')
        cls.customer_user = user.objects.create_user(username='forecast_user', email='forecast_user@example.com', password='Test123Strong!', role='user')
        cls.category = Category.objects.create(name='Forecast Test Category')
        cls.customer = Customer.objects.create(name='Forecast Customer')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def product(self, sku, stock=30, threshold=5, active=True):
        return Product.objects.create(name=f'Forecast {sku}', sku=sku,
                                      category=self.category, price=Decimal('15.00'),
                                      stock=stock, low_stock_threshold=threshold,
                                      is_active=active)

    def sale(self, product, quantity, *, status=Order.Status.PLACED, days_ago=0):
        order = Order.objects.create(customer=self.customer, created_by=self.admin, status=status)
        OrderItem.objects.create(order=order, product=product, quantity=quantity, unit_price=product.price)
        if days_ago:
            Order.objects.filter(pk=order.pk).update(created_at=timezone.now() - timedelta(days=days_ago))
        return order

    def test_default_empty_and_no_sales_is_not_fabricated(self):
        product = self.product('F-EMPTY', stock=3, threshold=10)
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['history_days'], 30)
        self.assertEqual(response.data['products_analyzed'], 1)
        result = response.data['products'][0]
        self.assertEqual(result['id'], product.pk)
        self.assertEqual(result['alert'], 'low')
        self.assertEqual(result['recent_units_sold'], 0)
        self.assertIsNone(result['days_remaining'])
        self.assertFalse(result['has_recent_sales'])
        self.assertEqual(result['suggested_reorder'], 7)

    def test_sales_run_rate_and_stock_cover_recommendation(self):
        p = self.product('F-RATE', stock=20, threshold=5)
        self.sale(p, 30)
        result = self.client.get(URL).data['products'][0]
        self.assertEqual(result['recent_units_sold'], 30)
        self.assertEqual(result['average_daily_sales'], 1.0)
        self.assertEqual(result['days_remaining'], 20.0)
        self.assertEqual(result['lead_time_demand'], 7)
        self.assertEqual(result['suggested_reorder'], 1)
        self.assertEqual(result['alert'], 'healthy')

    def test_at_risk_within_lead_time(self):
        p = self.product('F-RISK', stock=3, threshold=1)
        self.sale(p, 30)
        data = self.client.get(URL).data
        self.assertEqual(data['forecast_risk_count'], 1)
        self.assertEqual(data['low_stock_count'], 0)
        self.assertEqual(data['products'][0]['alert'], 'at_risk')
        self.assertEqual(data['products'][0]['suggested_reorder'], 18)

    def test_out_and_low_counts_and_inactive_excluded(self):
        self.product('F-OUT', stock=0, threshold=5)
        self.product('F-LOW', stock=2, threshold=5)
        self.product('F-INACTIVE', stock=0, threshold=5, active=False)
        data = self.client.get(URL).data
        self.assertEqual(data['products_analyzed'], 2)
        self.assertEqual(data['out_of_stock_count'], 1)
        self.assertEqual(data['low_stock_count'], 2)
        self.assertEqual([p['alert'] for p in data['products']], ['out', 'low'])

    def test_cancelled_orders_are_excluded(self):
        p = self.product('F-CANCEL', stock=2, threshold=4)
        self.sale(p, 100, status=Order.Status.CANCELLED)
        data = self.client.get(URL).data['products'][0]
        self.assertEqual(data['recent_units_sold'], 0)
        self.assertIsNone(data['days_remaining'])
        self.assertEqual(data['suggested_reorder'], 2)

    def test_old_orders_outside_window_are_excluded(self):
        p = self.product('F-OLD', stock=1, threshold=5)
        self.sale(p, 25, days_ago=45)
        self.assertEqual(self.client.get(URL).data['products'][0]['recent_units_sold'], 0)
        self.assertEqual(self.client.get(URL + '?history_days=60').data['products'][0]['recent_units_sold'], 25)

    def test_fulfilled_and_placed_sales_both_count(self):
        p = self.product('F-STATES', stock=3, threshold=5)
        self.sale(p, 4, status=Order.Status.PLACED)
        self.sale(p, 7, status=Order.Status.FULFILLED)
        self.assertEqual(self.client.get(URL).data['products'][0]['recent_units_sold'], 11)

    def test_no_mutations_from_forecast(self):
        p = self.product('F-SAFE', stock=4, threshold=7)
        self.sale(p, 3)
        movements_before = StockMovement.objects.count()
        self.assertEqual(self.client.get(URL).status_code, 200)
        p.refresh_from_db()
        self.assertEqual(p.stock, 4)
        self.assertEqual(StockMovement.objects.count(), movements_before)

    def test_roles_and_authentication(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(URL).status_code, 401)
        self.client.force_authenticate(user=self.customer_user)
        self.assertEqual(self.client.get(URL).status_code, 403)
        for actor in (self.admin, self.manager, self.staff):
            self.client.force_authenticate(user=actor)
            self.assertEqual(self.client.get(URL).status_code, 200)
        self.client.force_authenticate(user=self.staff)
        self.assertEqual(self.client.post(URL, {}, format='json').status_code, 405)

    def test_invalid_query_parameters(self):
        for param in ('history_days=0', 'history_days=91', 'lead_days=abc',
                      'lead_days=61', 'target_days=-1', 'target_days=91',
                      'limit=0', 'limit=101', 'history_days=1.2'):
            response = self.client.get(f'{URL}?{param}')
            self.assertEqual(response.status_code, 400, (param, response.data))

    def test_limit_does_not_change_summary_counts(self):
        self.product('F-LIMIT-1', stock=0)
        self.product('F-LIMIT-2', stock=0)
        self.product('F-LIMIT-3', stock=0)
        data = self.client.get(URL + '?limit=1').data
        self.assertEqual(len(data['products']), 1)
        self.assertEqual(data['products_analyzed'], 3)
        self.assertEqual(data['out_of_stock_count'], 3)
        self.assertEqual(data['reorder_count'], 3)

    def test_pending_purchase_orders_reduce_new_reorder_suggestion(self):
        p = self.product('F-PO', stock=2, threshold=10)
        supplier = Supplier.objects.create(name='Forecast Supplier')
        po = PurchaseOrder.objects.create(supplier=supplier, created_by=self.admin,
                                          status=PurchaseOrder.Status.ORDERED)
        line = PurchaseOrderItem.objects.create(purchase_order=po, product=p,
                                                 quantity=12, received_quantity=4,
                                                 unit_cost=Decimal('3.00'))
        data = self.client.get(URL).data
        row = data['products'][0]
        self.assertEqual(row['on_order_units'], 8)
        self.assertEqual(row['suggested_reorder'], 0)
        self.assertEqual(row['alert'], 'low')  # Alerts still reflect actual stock.
        self.assertEqual(data['reorder_count'], 0)
        po.status = PurchaseOrder.Status.CANCELLED
        po.save(update_fields=['status'])
        row = self.client.get(URL).data['products'][0]
        self.assertEqual(row['on_order_units'], 0)
        self.assertEqual(row['suggested_reorder'], 8)
