from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from .models import Category, Customer, Order, Payment, Product


class BillingAddonTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.manager = get_user_model().objects.create_user(
            username='billing_manager', password='StrongBillPass123!', role='manager')
        cls.user = get_user_model().objects.create_user(
            username='billing_customer', password='StrongBillPass123!', role='user')
        cls.category=Category.objects.create(name='Billing')
        cls.product=Product.objects.create(name='Desk Lamp', sku='LAMP-1',category=cls.category,
                             price=Decimal('500.00'),cost=Decimal('200'),stock=10)
        cls.customer=Customer.objects.create(name='Alex Buyer')

    def setUp(self):
        self.client=APIClient()
        self.client.force_authenticate(user=self.manager)
        response=self.client.post('/api/orders/',{'customer':self.customer.pk,
                 'items':[{'product':self.product.pk,'quantity':2}]},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.order_id=response.data['id']

    def test_partial_then_full_manual_payment(self):
        path=f'/api/orders/{self.order_id}/payments/'
        r=self.client.post(path,{'amount':'400.00','method':'cash'},format='json')
        self.assertEqual(r.status_code,201,r.data)
        order=self.client.get(f'/api/orders/{self.order_id}/').data
        self.assertEqual(order['payment_status'],'partial')
        r=self.client.post(path,{'amount':'600.00','method':'upi','reference':'UPI-DEMO-1'},format='json')
        self.assertEqual(r.status_code,201,r.data)
        order=self.client.get(f'/api/orders/{self.order_id}/').data
        self.assertEqual(order['payment_status'],'paid')
        self.assertEqual(Decimal(order['paid_amount']),Decimal('1000.00'))
        self.assertEqual(Payment.objects.filter(order_id=self.order_id).count(),2)

    def test_rejects_overpayment_and_negative_payment(self):
        path=f'/api/orders/{self.order_id}/payments/'
        self.assertEqual(self.client.post(path,{'amount':'1000.01','method':'cash'}).status_code,400)
        self.assertEqual(self.client.post(path,{'amount':'-1','method':'cash'}).status_code,400)

    def test_paid_order_cannot_cancel_without_refund_workflow(self):
        self.client.post(f'/api/orders/{self.order_id}/payments/',{'amount':'50.00','method':'cash'})
        self.assertEqual(self.client.post(f'/api/orders/{self.order_id}/cancel/').status_code,400)
        self.assertEqual(Order.objects.get(pk=self.order_id).status,'placed')

    def test_invoice_is_pdf_and_private(self):
        url=f'/api/orders/{self.order_id}/invoice/'
        res=self.client.get(url)
        self.assertEqual(res.status_code,200)
        self.assertEqual(res['Content-Type'],'application/pdf')
        self.assertTrue(res.content.startswith(b'%PDF'))
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.get(url).status_code,403)

    def test_unconfigured_gateway_disallowed(self):
        # This is a local-only test: don't contact Razorpay or use real money.
        from unittest.mock import patch
        with patch.dict('os.environ',{'RAZORPAY_KEY_ID':'','RAZORPAY_KEY_SECRET':''}):
            res=self.client.post(f'/api/orders/{self.order_id}/razorpay/start/',{},format='json')
        self.assertEqual(res.status_code,503)

    def test_regular_user_cannot_record_payment(self):
        self.client.force_authenticate(user=self.user)
        res=self.client.post(f'/api/orders/{self.order_id}/payments/',{'amount':'10','method':'cash'})
        self.assertEqual(res.status_code,403)
