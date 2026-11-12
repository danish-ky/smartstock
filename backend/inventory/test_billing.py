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
            username='billing_customer',
            email='billing_customer@example.com',
            password='StrongBillPass123!',
            role='user'
)

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
        self.assertEqual(self.client.get(url).status_code, 404)

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
        
        
        
        
    
    def test_rejected_payments_preserve_existing_records(self):
        payment_url = f'/api/orders/{self.order_id}/payments/'

        # Record one successful partial payment.
        response = self.client.post(
            payment_url,
            {
                'amount': '400.00',
                'method': 'cash'
            },
            format='json'
        )

        self.assertEqual(response.status_code, 201, response.data)

        # An additional 700 would exceed the 1000 order total.
        response = self.client.post(
            payment_url,
            {
                'amount': '700.00',
                'method': 'cash'
            },
            format='json'
        )

        self.assertEqual(response.status_code, 400)

        # Negative payments must also be rejected.
        response = self.client.post(
            payment_url,
            {
                'amount': '-1.00',
                'method': 'cash'
            },
            format='json'
        )

        self.assertEqual(response.status_code, 400)

        # Only the successful payment should exist.
        payments = Payment.objects.filter(order_id=self.order_id)

        self.assertEqual(payments.count(), 1)
        self.assertEqual(
            payments.first().amount,
            Decimal('400.00')
        )

        # Verify the order total and status remain unchanged.
        order = Order.objects.get(pk=self.order_id)

        self.assertEqual(order.total, Decimal('1000.00'))
        self.assertEqual(order.status, Order.Status.PLACED)

        # Payment failures must not change inventory.
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)

        # Verify outstanding payment information.
        response = self.client.get(payment_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            Decimal(response.data['paid_amount']),
            Decimal('400.00')
        )
        self.assertEqual(
            response.data['payment_status'],
            'partial'
        )





    def test_invoice_payment_balance_consistency(self):
        from .billing import paid_amount, payment_state

        order = Order.objects.get(pk=self.order_id)

        # Calculate the total from the order items.
        item_total = sum(
            (
                item.unit_price * item.quantity
                for item in order.items.all()
            ),
            Decimal('0.00')
        )

        self.assertEqual(
            item_total,
            Decimal('1000.00')
        )
        self.assertEqual(order.total, item_total)

        # Record a partial payment.
        payment_url = f'/api/orders/{self.order_id}/payments/'

        response = self.client.post(
            payment_url,
            {'amount': '400.00', 'method': 'cash'},
            format='json'
        )
        self.assertEqual(response.status_code, 201, response.data)

        order.refresh_from_db()

        self.assertEqual(
            paid_amount(order),
            Decimal('400.00')
        )
        self.assertEqual(
            order.total - paid_amount(order),
            Decimal('600.00')
        )
        self.assertEqual(payment_state(order), 'partial')

        # Payment API must agree with stored payments.
        response = self.client.get(payment_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            Decimal(response.data['paid_amount']),
            Decimal('400.00')
        )

        # Invoice must be generated successfully.
        invoice = self.client.get(
            f'/api/orders/{self.order_id}/invoice/'
        )

        self.assertEqual(invoice.status_code, 200)
        self.assertEqual(
            invoice['Content-Type'],
            'application/pdf'
        )
        self.assertTrue(invoice.content.startswith(b'%PDF'))

        # Complete the outstanding payment.
        response = self.client.post(
            payment_url,
            {'amount': '600.00', 'method': 'upi'},
            format='json'
        )
        self.assertEqual(response.status_code, 201, response.data)

        order.refresh_from_db()

        self.assertEqual(
            paid_amount(order),
            Decimal('1000.00')
        )
        self.assertEqual(
            order.total - paid_amount(order),
            Decimal('0.00')
        )
        self.assertEqual(payment_state(order), 'paid')

        # The invoice should still generate correctly.
        invoice = self.client.get(
            f'/api/orders/{self.order_id}/invoice/'
        )
        self.assertEqual(invoice.status_code, 200)





    def test_razorpay_verification_prevents_duplicate_payments(self):
        import hashlib
        import hmac
        from unittest.mock import patch
        from .models import RazorpayAttempt

        # Create a fake Razorpay checkout for the existing order.
        attempt = RazorpayAttempt.objects.create(
            order_id=self.order_id,
            gateway_order_id='order_test_smartstock_001',
            amount_paise=100000
        )

        payment_id = 'pay_test_smartstock_001'
        secret = 'local-test-secret-only'

        # Generate a valid test signature.
        message = (
            f'{attempt.gateway_order_id}|{payment_id}'
        ).encode()

        signature = hmac.new(
            secret.encode(),
            message,
            hashlib.sha256
        ).hexdigest()

        # Simulate the Razorpay server confirming a captured payment.
        fake_payment = {
            'id': payment_id,
            'order_id': attempt.gateway_order_id,
            'status': 'captured',
            'currency': 'INR',
            'amount': 100000
        }

        url = (
            f'/api/orders/{self.order_id}/razorpay/verify/'
        )

        payload = {
            'razorpay_order_id': attempt.gateway_order_id,
            'razorpay_payment_id': payment_id,
            'razorpay_signature': signature
        }

        # Mock Razorpay: no external requests or real money.
        with patch.dict(
            'os.environ',
            {'RAZORPAY_KEY_SECRET': secret}
        ), patch(
            'inventory.billing.gateway_client'
        ) as mock_gateway:

            mock_gateway.return_value.payment.fetch.return_value = (
                fake_payment
            )

            # First callback should record the payment.
            response = self.client.post(
                url,
                payload,
                format='json'
            )

            self.assertEqual(
                response.status_code,
                200,
                response.data
            )
            self.assertTrue(response.data['verified'])

            # Repeating the same callback must not duplicate it.
            response = self.client.post(
                url,
                payload,
                format='json'
            )

            self.assertEqual(
                response.status_code,
                200,
                response.data
            )

        # Exactly one Razorpay payment must exist.
        payments = Payment.objects.filter(
            order_id=self.order_id,
            gateway_payment_id=payment_id
        )

        self.assertEqual(payments.count(), 1)

        self.assertEqual(
            payments.first().amount,
            Decimal('1000.00')
        )

        # Total payments must not exceed the order total.
        from .billing import paid_amount, payment_state

        order = Order.objects.get(pk=self.order_id)

        self.assertEqual(
            paid_amount(order),
            Decimal('1000.00')
        )

        self.assertEqual(payment_state(order), 'paid')

        # The checkout attempt should be marked as paid.
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, 'paid')

        # Recording a payment must not deduct stock again.
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)





    def test_razorpay_webhook_signature_and_duplicate_protection(self):
        import hashlib
        import hmac
        import json
        from unittest.mock import patch
        from .models import RazorpayAttempt

        webhook_url = '/api/razorpay/webhook/'
        webhook_secret = 'local-webhook-test-secret'

        gateway_order_id = 'order_test_webhook_001'
        payment_id = 'pay_test_webhook_001'

        # Create a local test checkout.
        attempt = RazorpayAttempt.objects.create(
            order_id=self.order_id,
            gateway_order_id=gateway_order_id,
            amount_paise=100000
        )

        # Simulate a Razorpay payment.captured event.
        payload = {
            'event': 'payment.captured',
            'payload': {
                'payment': {
                    'entity': {
                        'id': payment_id,
                        'order_id': gateway_order_id
                    }
                }
            }
        }

        raw_body = json.dumps(payload).encode('utf-8')

        # Generate the webhook signature.
        valid_signature = hmac.new(
            webhook_secret.encode(),
            raw_body,
            hashlib.sha256
        ).hexdigest()

        # Mock the gateway's captured-payment response.
        fake_payment = {
            'id': payment_id,
            'order_id': gateway_order_id,
            'status': 'captured',
            'currency': 'INR',
            'amount': 100000
        }

        with patch.dict(
            'os.environ',
            {'RAZORPAY_WEBHOOK_SECRET': webhook_secret}
        ), patch(
            'inventory.billing.gateway_client'
        ) as mock_gateway:

            mock_gateway.return_value.payment.fetch.return_value = (
                fake_payment
            )

            # 1. Invalid signature must be rejected.
            response = self.client.post(
                webhook_url,
                data=raw_body,
                content_type='application/json',
                HTTP_X_RAZORPAY_SIGNATURE='invalid-signature'
            )

            self.assertEqual(response.status_code, 403)
            self.assertEqual(
                Payment.objects.filter(order_id=self.order_id).count(),
                0
            )

            # 2. Valid webhook must record one payment.
            response = self.client.post(
                webhook_url,
                data=raw_body,
                content_type='application/json',
                HTTP_X_RAZORPAY_SIGNATURE=valid_signature
            )

            self.assertEqual(response.status_code, 200, response.data)

            # 3. Duplicate webhook must not record another payment.
            response = self.client.post(
                webhook_url,
                data=raw_body,
                content_type='application/json',
                HTTP_X_RAZORPAY_SIGNATURE=valid_signature
            )

            self.assertEqual(response.status_code, 200, response.data)

        # Exactly one payment must exist.
        payments = Payment.objects.filter(
            order_id=self.order_id,
            gateway_payment_id=payment_id
        )

        self.assertEqual(payments.count(), 1)
        self.assertEqual(
            payments.first().amount,
            Decimal('1000.00')
        )

        # Order and checkout status must remain consistent.
        from .billing import paid_amount, payment_state

        order = Order.objects.get(pk=self.order_id)

        self.assertEqual(
            paid_amount(order),
            Decimal('1000.00')
        )
        self.assertEqual(payment_state(order), 'paid')

        attempt.refresh_from_db()
        self.assertEqual(attempt.status, 'paid')

        # Webhook callbacks must never deduct stock again.
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)
