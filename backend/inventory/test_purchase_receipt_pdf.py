"""GRN PDF authorization, ownership and document behavior tests."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Category, Product, PurchaseReceipt, StockMovement, Supplier


class GoodsReceivedNoteTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.manager = User.objects.create_user(
            username='grn_manager', email='grn_manager@example.com',
            password='test-only', role='manager',
        )
        self.staff = User.objects.create_user(
            username='grn_staff', email='grn_staff@example.com',
            password='test-only', role='staff',
        )
        self.customer = User.objects.create_user(
            username='grn_customer', email='grn_customer@example.com',
            password='test-only', role='user',
        )
        self.supplier = Supplier.objects.create(name='GRN Vendor')
        cat = Category.objects.create(name='GRN Test Category')
        self.product = Product.objects.create(
            sku='GRN-001', name='Sample received product', category=cat,
            supplier=self.supplier, price=Decimal('50.00'),
            cost=Decimal('18.50'), stock=10,
        )
        self.client.force_authenticate(user=self.manager)

    def make_received_po(self):
        po = self.client.post('/api/purchase-orders/', {
            'supplier': self.supplier.pk,
            'items': [{'product': self.product.pk, 'quantity': 3}],
        }, format='json')
        self.assertEqual(po.status_code, 201, getattr(po, 'data', None))
        po_id = po.data['id']
        response = self.client.post(f'/api/purchase-orders/{po_id}/place/')
        self.assertEqual(response.status_code, 200)
        received = self.client.post(f'/api/purchase-orders/{po_id}/receive/', {
            'items': [{'item': po.data['items'][0]['id'], 'quantity': 2}],
            'note': 'Delivery verification',
        }, format='json')
        self.assertEqual(received.status_code, 200, received.data)
        return po_id, received.data['receipts'][0]['id']

    def test_pdf_renders_and_does_not_change_stock(self):
        po_id, receipt_id = self.make_received_po()
        count = StockMovement.objects.count()
        current_stock = Product.objects.get(pk=self.product.pk).stock
        response = self.client.get(f'/api/purchase-orders/{po_id}/receipts/{receipt_id}/pdf/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('application/pdf', response['Content-Type'])
        self.assertIn('inline', response['Content-Disposition'])
        pdf = b''.join(response.streaming_content)
        self.assertTrue(pdf.startswith(b'%PDF-'), pdf[:50])
        self.assertGreater(len(pdf), 500)
        self.assertEqual(StockMovement.objects.count(), count)
        self.assertEqual(Product.objects.get(pk=self.product.pk).stock, current_stock)

    def test_download_header_and_staff_allowed(self):
        po_id, receipt_id = self.make_received_po()
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(f'/api/purchase-orders/{po_id}/receipts/{receipt_id}/pdf/?download=1')
        self.assertEqual(response.status_code, 200)
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertIn('application/pdf', response['Content-Type'])
        self.assertTrue(b''.join(response.streaming_content).startswith(b'%PDF-'))

    def test_customer_and_anonymous_denied(self):
        po_id, receipt_id = self.make_received_po()
        url = f'/api/purchase-orders/{po_id}/receipts/{receipt_id}/pdf/'
        self.client.force_authenticate(user=self.customer)
        self.assertEqual(self.client.get(url).status_code, 403)
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(url).status_code, (401, 403))

    def test_cannot_access_receipt_of_another_po(self):
        first_po, first_receipt = self.make_received_po()
        second_po, second_receipt = self.make_received_po()
        self.assertNotEqual(first_receipt, second_receipt)
        url = f'/api/purchase-orders/{first_po}/receipts/{second_receipt}/pdf/'
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get(f'/api/purchase-orders/{second_po}/receipts/{second_receipt}/pdf/').status_code, 200)

    def test_unknown_receipt_and_post_method_not_allowed(self):
        po_id, receipt_id = self.make_received_po()
        self.assertEqual(self.client.get(f'/api/purchase-orders/{po_id}/receipts/999999/pdf/').status_code, 404)
        self.assertEqual(self.client.post(f'/api/purchase-orders/{po_id}/receipts/{receipt_id}/pdf/').status_code, 405)
