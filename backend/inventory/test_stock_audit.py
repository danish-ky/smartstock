"""Integration tests for the immutable-by-API stock movement audit snapshots."""
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase
from .models import Category, Customer, Product, StockMovement
from .serializers import StockMovementSerializer
from .services import adjust_stock, change_order_status, place_order


class StockAuditTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.manager = User.objects.create_user(
            username='audit_manager',
            email='audit_manager@example.com',
            password='test-password',
            role='manager'
        )

        self.customer_user = User.objects.create_user(
            username='audit_customer',
            email='audit_customer@example.com',
            password='test-password',
            role='user'
        )

        category = Category.objects.create(name='Audit test category')
        self.product = Product.objects.create(
            name='Audit product', sku='AUDIT-001', category=category,
            price=Decimal('25.00'), cost=Decimal('10.00'), stock=12,
        )
        self.customer = Customer.objects.create(name='Audit customer', user=self.customer_user)

    def test_manual_in_out_snapshots_and_sku(self):
        incoming = adjust_stock(product_id=self.product.pk, movement_type='in',
                                quantity=5, actor=self.manager, note='Restock')
        outgoing = adjust_stock(product_id=self.product.pk, movement_type='out',
                                quantity=3, actor=self.manager, note='Damage')
        self.assertEqual((incoming.stock_before, incoming.stock_after), (12, 17))
        self.assertEqual((outgoing.stock_before, outgoing.stock_after), (17, 14))
        self.assertEqual(incoming.product_sku, 'AUDIT-001')
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 14)
        data = StockMovementSerializer(outgoing).data
        self.assertEqual(data['performed_by_name'], self.manager.username)
        self.assertEqual(data['stock_before'], 17)
        self.assertEqual(data['stock_after'], 14)

    def test_sale_and_cancellation_restore_snapshots(self):
        order = place_order(customer=self.customer,
                            lines=[{'product': self.product, 'quantity': 2}],
                            actor=self.manager)
        sale = StockMovement.objects.get(order=order, movement_type='sale')
        self.assertEqual((sale.stock_before, sale.stock_after), (12, 10))
        self.assertEqual(sale.order_id, order.id)
        change_order_status(order_id=order.pk, status='cancelled', actor=self.manager)
        returned = StockMovement.objects.get(order=order, movement_type='return')
        self.assertEqual((returned.stock_before, returned.stock_after), (10, 12))
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 12)
        self.assertEqual(StockMovementSerializer(returned).data['order_number'], order.number)

    def test_rejected_oversell_makes_no_audit_entry(self):
        with self.assertRaises(ValidationError):
            adjust_stock(product_id=self.product.pk, movement_type='out',
                         quantity=13, actor=self.manager)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 12)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_legacy_movement_has_unknown_snapshots(self):
        legacy = StockMovement.objects.create(product=self.product, movement_type='in',
                                              quantity=2, performed_by=self.manager)
        data = StockMovementSerializer(legacy).data
        self.assertIsNone(data['stock_before'])
        self.assertIsNone(data['stock_after'])
        self.assertEqual(data['product_sku'], '')

    def test_audit_api_read_only_and_role_restricted(self):
        adjust_stock(product_id=self.product.pk, movement_type='in',
                     quantity=1, actor=self.manager)
        self.client.force_authenticate(user=self.manager)
        result = self.client.get('/api/movements/')
        self.assertEqual(result.status_code, 200)
        rows = result.data['results'] if isinstance(result.data, dict) else result.data
        self.assertEqual(rows[0]['stock_before'], 12)
        self.assertEqual(rows[0]['stock_after'], 13)
        self.assertEqual(self.client.post('/api/movements/', {
            'product': self.product.id, 'quantity': 10, 'movement_type': 'in'
        }).status_code, 405)
        self.client.force_authenticate(user=self.customer_user)
        self.assertEqual(self.client.get('/api/movements/').status_code, 403)
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get('/api/movements/').status_code, (401, 403))
