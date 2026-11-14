"""Run: python manage.py test inventory.test_bulk_products"""
import csv
from decimal import Decimal
from io import BytesIO, StringIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Category, Product, StockMovement, Supplier


class BulkProductTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username='bulk_admin', email='bulk_admin@example.com',
            password='LongTestPass123!', role='admin',
        )
        cls.manager = get_user_model().objects.create_user(
            username='bulk_manager', email='bulk_manager@example.com',
            password='LongTestPass123!', role='manager',
        )
        cls.staff = get_user_model().objects.create_user(
            username='bulk_staff', email='bulk_staff@example.com',
            password='LongTestPass123!', role='staff',
        )
        cls.customer = get_user_model().objects.create_user(
            username='bulk_customer', email='bulk_customer@example.com',
            password='LongTestPass123!', role='user',
        )
        cls.category = Category.objects.create(name='Widgets')
        cls.supplier = Supplier.objects.create(name='Supplier Ltd')
        cls.product = Product.objects.create(
            name='Original', sku='EXIST-01', category=cls.category,
            supplier=cls.supplier, price=Decimal('19.00'),
            cost=Decimal('6.00'), stock=12,
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def _csv(self, lines):
        body = StringIO()
        writer = csv.writer(body)
        writer.writerows(lines)
        return SimpleUploadedFile('products.csv', body.getvalue().encode(), content_type='text/csv')

    def _send(self, lines, **extra):
        return self.client.post('/api/products/bulk/import/', {
            'file': self._csv(lines), **extra,
        }, format='multipart')

    def _rows(self, *data):
        return [
            ['sku', 'name', 'category', 'supplier', 'description', 'price', 'cost',
             'low_stock_threshold', 'is_active'],
            *data,
        ]

    def _row(self, sku='NEW-01', name='New Widget', price='29.95'):
        return [sku, name, 'Widgets', 'Supplier Ltd', 'New description', price, '11.50', '5', 'true']

    def test_preview_does_not_write_and_commit_creates_without_stock_movement(self):
        body = self._rows(self._row())
        preview = self._send(body)
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertTrue(preview.data['valid'])
        self.assertFalse(preview.data['committed'])
        self.assertEqual(preview.data['created'], 1)
        self.assertFalse(Product.objects.filter(sku='NEW-01').exists())
        saved = self._send(body, commit='true')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertTrue(saved.data['committed'])
        product = Product.objects.get(sku='NEW-01')
        self.assertEqual(product.stock, 0)
        self.assertEqual(product.category, self.category)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_existing_sku_in_create_mode_rejected_without_changes(self):
        response = self._send(self._rows(self._row('EXIST-01')) , commit='true')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(response.data['valid'])
        self.assertEqual(Product.objects.count(), 1)

    def test_upsert_preserves_stock_and_existing_photo(self):
        self.product.image.name = 'product_images/old.jpg'
        self.product.save(update_fields=['image'])
        response = self._send(self._rows(self._row('EXIST-01', 'Updated Widget')), mode='upsert', commit='true')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['updated'], 1)
        self.product.refresh_from_db()
        self.assertEqual(self.product.name, 'Updated Widget')
        self.assertEqual(self.product.stock, 12)
        self.assertEqual(self.product.image.name, 'product_images/old.jpg')
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_validation_is_atomic_for_duplicate_and_invalid_rows(self):
        body = self._rows(self._row('TEST-01'), self._row('TEST-01', 'Duplicate'))
        response = self._send(body, commit='true')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Product.objects.count(), 1)
        self.assertEqual(response.data['errors'][0]['row'], 3)
        body = self._rows(self._row('VALID-01'), self._row('INVALID-01', price='-12'))
        response = self._send(body, commit='true')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Product.objects.count(), 1)

    def test_unknown_supplier_and_missing_category(self):
        row = self._row()
        row[3] = 'Not our supplier'
        response = self._send(self._rows(row))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['valid'])
        self.assertEqual(response.data['errors'][0]['field'], 'supplier')
        row[2] = 'Unknown category'
        response = self._send(self._rows(row), commit='true')
        self.assertEqual(response.status_code, 400, response.data)

    def test_read_only_stock_and_other_export_columns_rejected(self):
        response = self._send([['sku','name','category','price','stock'], ['X','A','Widgets','1.00','999']], commit='true')
        self.assertEqual(response.status_code, 400)
        self.assertIn('read-only', response.data['detail'])
        self.assertEqual(self.product.stock, 12)

    def test_csv_and_excel_template_and_export(self):
        for fmt in ('csv', 'xlsx'):
            response = self.client.get('/api/products/bulk/template/', {'file_format': fmt})
            self.assertEqual(response.status_code, 200)
            self.assertGreater(len(response.content), 20)
            response = self.client.get('/api/products/bulk/export/', {'file_format': fmt})
            self.assertEqual(response.status_code, 200)
            self.assertGreater(len(response.content), 60)
            self.assertIn('attachment', response['Content-Disposition'])
            self.assertIn('no-store', response['Cache-Control'])
            if fmt == 'csv':
                text = response.content.decode('utf-8-sig')
                self.assertIn('EXIST-01', text)
                self.assertIn('stock', text)
            else:
                from openpyxl import load_workbook
                wb = load_workbook(BytesIO(response.content), read_only=True)
                self.assertEqual(list(wb.active.values)[1][0], 'EXIST-01')
                wb.close()

    def test_excel_import(self):
        from openpyxl import Workbook
        wb = Workbook()
        wb.active.append(['sku', 'name', 'category', 'price'])
        wb.active.append(['EXCEL-01', 'Excel product', 'Widgets', 33.25])
        output = BytesIO()
        wb.save(output)
        wb.close()
        response = self.client.post('/api/products/bulk/import/', {
            'file': SimpleUploadedFile('catalog.xlsx', output.getvalue(),
                                       content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            'commit': 'true',
        }, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Product.objects.get(sku='EXCEL-01').price, Decimal('33.25'))

    def test_permissions_for_admin_manager_staff_user_anonymous(self):
        for user, expected in ((self.manager, 200), (self.staff, 403), (self.customer, 403), (None, 401)):
            self.client.force_authenticate(user=user)
            self.assertEqual(self.client.get('/api/products/bulk/export/').status_code, expected)
            self.assertEqual(self.client.get('/api/products/bulk/template/').status_code, expected)
            self.assertEqual(self._send(self._rows(self._row())).status_code, expected)

    def test_formula_injection_escaped_on_export(self):
        self.product.name = '=HYPERLINK("https://example.com")'
        self.product.save(update_fields=['name'])
        response = self.client.get('/api/products/bulk/export/?file_format=csv')
        self.assertEqual(response.status_code, 200)
        reader = csv.DictReader(StringIO(response.content.decode('utf-8-sig')))
        self.assertTrue(next(reader)['name'].startswith("'="))

    def test_limits_and_bad_format(self):
        response = self.client.get('/api/products/bulk/export/?file_format=pdf')
        self.assertEqual(response.status_code, 400)
        response = self.client.post('/api/products/bulk/import/', {
            'file': SimpleUploadedFile('x.csv', b'A' * (2 * 1024 * 1024 + 1)),
        }, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Product.objects.count(), 1)
