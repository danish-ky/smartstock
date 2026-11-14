"""Purchase-order API, permissions, stock integrity and receipt audit tests."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import (Category, Product, PurchaseOrder, PurchaseOrderItem,
                     PurchaseReceipt, StockMovement, Supplier)


class PurchaseOrderTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.manager = User.objects.create_user(
            username='po_manager', email='po_manager@example.com',
            password='po-test-only', role='manager'
        )
        self.staff = User.objects.create_user(
            username='po_staff', email='po_staff@example.com',
            password='po-test-only', role='staff'
        )
        self.customer = User.objects.create_user(
            username='po_customer', email='po_customer@example.com',
            password='po-test-only', role='user'
        )
        self.supplier = Supplier.objects.create(name='Purchase test supplier')
        self.other_supplier = Supplier.objects.create(name='Different supplier')
        category = Category.objects.create(name='Purchase test category')
        self.product = Product.objects.create(
            sku='PO-TEST-001', name='Purchase test product', category=category,
            supplier=self.supplier, price=Decimal('40.00'),
            cost=Decimal('18.50'), stock=10,
        )
        self.product2 = Product.objects.create(
            sku='PO-TEST-002', name='Second purchase test product', category=category,
            supplier=self.supplier, price=Decimal('50.00'),
            cost=Decimal('20.00'), stock=20,
        )
        self.client.force_authenticate(user=self.manager)

    def create_po(self, items=None):
        response = self.client.post('/api/purchase-orders/', {
            'supplier': self.supplier.pk,
            'items': items or [{'product': self.product.pk, 'quantity': 7}],
            'notes': 'Test vendor replenishment',
        }, format='json')
        self.assertEqual(response.status_code, 201, getattr(response, 'data', None))
        return response.data

    def test_create_and_place_do_not_change_stock(self):
        data = self.create_po()
        self.assertEqual(data['status'], 'draft')
        self.assertTrue(data['number'].startswith('PO-'))
        self.assertEqual(Decimal(str(data['total'])), Decimal('129.50'))
        self.assertEqual(len(data['items']), 1)
        response = self.client.post(f"/api/purchase-orders/{data['id']}/place/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], 'ordered')
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
        self.assertFalse(StockMovement.objects.exists())

    def test_partial_and_full_receive_create_linked_audit_snapshots(self):
        data = self.create_po()
        po_id = data['id']
        line_id = data['items'][0]['id']
        self.client.post(f'/api/purchase-orders/{po_id}/place/')
        first = self.client.post(f'/api/purchase-orders/{po_id}/receive/', {
            'items': [{'item': line_id, 'quantity': 3}], 'note': 'Box 1',
        }, format='json')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(first.data['status'], 'partial')
        self.assertEqual(first.data['items'][0]['received_quantity'], 3)
        self.assertEqual(first.data['items'][0]['remaining_quantity'], 4)
        second = self.client.post(f'/api/purchase-orders/{po_id}/receive/', {
            'items': [{'item': line_id, 'quantity': 4}], 'note': 'Box 2',
        }, format='json')
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(second.data['status'], 'received')
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 17)
        movements = list(StockMovement.objects.filter(purchase_order_id=po_id).order_by('pk'))
        self.assertEqual([(m.stock_before, m.stock_after) for m in movements], [(10, 13), (13, 17)])
        self.assertEqual([m.quantity for m in movements], [3, 4])
        self.assertTrue(all(m.purchase_receipt_id for m in movements))
        self.assertEqual(PurchaseReceipt.objects.filter(purchase_order_id=po_id).count(), 2)

    def test_staff_can_receive_but_cannot_create_place_or_cancel(self):
        data = self.create_po()
        po_id = data['id']
        line_id = data['items'][0]['id']
        self.client.force_authenticate(user=self.staff)
        self.assertEqual(self.client.get('/api/purchase-orders/').status_code, 200)
        self.assertEqual(self.client.post('/api/purchase-orders/', {
            'supplier': self.supplier.pk,
            'items': [{'product': self.product.pk, 'quantity': 1}],
        }, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'/api/purchase-orders/{po_id}/place/').status_code, 403)
        self.client.force_authenticate(user=self.manager)
        self.assertEqual(self.client.post(f'/api/purchase-orders/{po_id}/place/').status_code, 200)
        self.client.force_authenticate(user=self.staff)
        result = self.client.post(f'/api/purchase-orders/{po_id}/receive/', {
            'items': [{'item': line_id, 'quantity': 1}],
        }, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['receipts'][0]['received_by_name'], self.staff.username)
        self.assertEqual(self.client.post(f'/api/purchase-orders/{po_id}/cancel/').status_code, 403)

    def test_customer_and_anonymous_denied_purchase_prices(self):
        data = self.create_po()
        self.client.force_authenticate(user=self.customer)
        self.assertEqual(self.client.get('/api/purchase-orders/').status_code, 403)
        self.assertEqual(self.client.get(f"/api/purchase-orders/{data['id']}/").status_code, 403)
        self.assertEqual(self.client.post(f"/api/purchase-orders/{data['id']}/receive/", {
            'items': [{'item': data['items'][0]['id'], 'quantity': 1}],
        }, format='json').status_code, 403)
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get('/api/purchase-orders/').status_code, (401, 403))

    def test_reject_wrong_supplier_and_duplicate_product(self):
        wrong = self.client.post('/api/purchase-orders/', {
            'supplier': self.other_supplier.pk,
            'items': [{'product': self.product.pk, 'quantity': 1}],
        }, format='json')
        self.assertEqual(wrong.status_code, 400)
        duplicate = self.client.post('/api/purchase-orders/', {
            'supplier': self.supplier.pk,
            'items': [{'product': self.product.pk, 'quantity': 1},
                      {'product': self.product.pk, 'quantity': 2}],
        }, format='json')
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(PurchaseOrder.objects.count(), 0)

    def test_multi_line_over_receive_rolls_back_everything(self):
        data = self.create_po([
            {'product': self.product.pk, 'quantity': 2},
            {'product': self.product2.pk, 'quantity': 4},
        ])
        self.client.post(f"/api/purchase-orders/{data['id']}/place/")
        by_product = {row['product']: row['id'] for row in data['items']}
        result = self.client.post(f"/api/purchase-orders/{data['id']}/receive/", {
            'items': [
                {'item': by_product[self.product.pk], 'quantity': 2},
                {'item': by_product[self.product2.pk], 'quantity': 5},
            ],
        }, format='json')
        self.assertEqual(result.status_code, 400)
        self.assertEqual(PurchaseReceipt.objects.count(), 0)
        self.assertEqual(StockMovement.objects.count(), 0)
        self.product.refresh_from_db()
        self.product2.refresh_from_db()
        self.assertEqual((self.product.stock, self.product2.stock), (10, 20))

    def test_invalid_receipt_rejected_and_no_duplicate_receiving(self):
        data = self.create_po()
        po_id = data['id']
        item = data['items'][0]['id']
        premature = self.client.post(f'/api/purchase-orders/{po_id}/receive/', {
            'items': [{'item': item, 'quantity': 1}],
        }, format='json')
        self.assertEqual(premature.status_code, 400)
        self.client.post(f'/api/purchase-orders/{po_id}/place/')
        for lines in ([{'item': item, 'quantity': 0}],
                      [{'item': 123456789, 'quantity': 1}],
                      [{'item': item, 'quantity': 1}, {'item': item, 'quantity': 1}]):
            response = self.client.post(f'/api/purchase-orders/{po_id}/receive/',
                                        {'items': lines}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(StockMovement.objects.exists())

    def test_cancel_before_receiving_only(self):
        draft = self.create_po()
        cancelled = self.client.post(f"/api/purchase-orders/{draft['id']}/cancel/")
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.data['status'], 'cancelled')
        self.assertEqual(self.client.post(f"/api/purchase-orders/{draft['id']}/place/").status_code, 400)
        data = self.create_po()
        self.client.post(f"/api/purchase-orders/{data['id']}/place/")
        self.client.post(f"/api/purchase-orders/{data['id']}/receive/", {
            'items': [{'item': data['items'][0]['id'], 'quantity': 1}],
        }, format='json')
        self.assertEqual(self.client.post(f"/api/purchase-orders/{data['id']}/cancel/").status_code, 400)
        self.assertEqual(PurchaseOrder.objects.get(pk=data['id']).status, 'partial')
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 11)

    def test_non_destructive_api_no_edit_or_delete(self):
        data = self.create_po()
        po_id = data['id']
        self.assertEqual(self.client.patch(f'/api/purchase-orders/{po_id}/',
                                           {'notes': 'Manipulate'}, format='json').status_code, 405)
        self.assertEqual(self.client.delete(f'/api/purchase-orders/{po_id}/').status_code, 405)
        self.assertEqual(PurchaseOrderItem.objects.count(), 1)
