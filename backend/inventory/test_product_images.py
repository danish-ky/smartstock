"""Optional product images: authorization, validation, customer-safe display."""
import io
import tempfile
from decimal import Decimal
from PIL import Image
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from .models import Category, Product


def test_image():
    buf = io.BytesIO()
    Image.new('RGB', (32, 32), 'white').save(buf, format='PNG')
    return SimpleUploadedFile('photo.png', buf.getvalue(), content_type='image/png')


class ProductImageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        U = get_user_model()
        cls.manager = U.objects.create_user(username='image_manager', email='image_manager@example.com', role='manager', password='SafePass123!')
        cls.staff = U.objects.create_user(username='image_staff', email='image_staff@example.com', role='staff', password='SafePass123!')
        cls.customer = U.objects.create_user(username='image_customer', email='image_customer@example.com', role='user', password='SafePass123!')
        cls.category = Category.objects.create(name='Image Tests')
        cls.product = Product.objects.create(name='Picture Product', sku='IMG-0001', category=cls.category, price=Decimal('100.00'))

    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.override = override_settings(MEDIA_ROOT=self.tempdir.name, MEDIA_URL='/media/')
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.addCleanup(self.tempdir.cleanup)
        self.client = APIClient()

    def test_manager_can_upload_and_remove_image(self):
        self.client.force_authenticate(self.manager)
        url = f'/api/products/{self.product.pk}/image/'
        response = self.client.post(url, {'image': test_image()}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('/media/product_images/', response.data['image_url'])
        self.assertTrue(Product.objects.get(pk=self.product.pk).image.name)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(response.data['image_url'])

    def test_staff_and_customer_cannot_upload(self):
        url = f'/api/products/{self.product.pk}/image/'
        for user in (self.staff, self.customer):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post(url, {'image': test_image()}, format='multipart').status_code, 403)

    def test_invalid_image_rejected(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post(f'/api/products/{self.product.pk}/image/',
            {'image': SimpleUploadedFile('fake.jpg', b'not an image', content_type='image/jpeg')}, format='multipart')
        self.assertEqual(response.status_code, 400)

    def test_customer_can_see_image_without_internal_cost(self):
        self.client.force_authenticate(self.manager)
        self.client.post(f'/api/products/{self.product.pk}/image/', {'image': test_image()}, format='multipart')
        self.client.force_authenticate(self.customer)
        response = self.client.get('/api/products/')
        self.assertEqual(response.status_code, 200)
        products = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertIn('image_url', products[0])
        self.assertNotIn('cost', products[0])
        self.assertNotIn('stock', products[0])
