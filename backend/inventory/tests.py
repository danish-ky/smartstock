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
        
        
        
    
    def test_duplicate_product_lines_cannot_oversell(self):
        # Product initially has 10 units in stock.
        # Each line requests 6 units, but combined demand is 12.
        response = self.client.post(
            '/api/orders/',
            {
                'customer': self.customer.pk,
                'items': [
                    {
                        'product': self.product.pk,
                        'quantity': 6
                    },
                    {
                        'product': self.product.pk,
                        'quantity': 6
                    }
                ]
            },
            format='json'
        )

        # Reject the order because total demand exceeds stock.
        self.assertEqual(response.status_code, 400, response.data)

        # Stock must remain unchanged.
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

        # No order should have been created.
        self.assertEqual(Order.objects.count(), 0)

        # No sale movement should have been recorded.
        self.assertEqual(
            StockMovement.objects.filter(movement_type='sale').count(),
            0
        )

        
        
        

    def test_stock_is_read_only_through_product_api(self):
        res = self.client.patch(f'/api/products/{self.product.pk}/',{'stock':500},format='json')
        self.assertEqual(res.status_code,200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock,10)

    def test_dashboard_and_reports(self):
        self.assertEqual(self.client.get('/api/dashboard/').status_code,200)
        self.assertEqual(self.client.get('/api/reports/').status_code,200)
        
        
        
        
    
    def test_fulfilled_order_cannot_be_changed_again(self):
        from inventory.services import change_order_status
        from rest_framework.exceptions import ValidationError

        response = self.client.post(
            '/api/orders/',
            {
                'customer': self.customer.pk,
                'items': [
                    {'product': self.product.pk, 'quantity': 4}
                ]
            },
            format='json'
        )

        self.assertEqual(response.status_code, 201, response.data)

        order_id = response.data['id']

        # Fulfill the order.
        order = change_order_status(
            order_id=order_id,
            status='fulfilled',
            actor=self.admin
        )

        self.assertEqual(order.status, Order.Status.FULFILLED)

        # Fulfillment must not deduct stock again.
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 6)

        # Fulfilled orders cannot be cancelled.
        with self.assertRaises(ValidationError):
            change_order_status(
                order_id=order_id,
                status='cancelled',
                actor=self.admin
            )

        # Fulfilled orders cannot be fulfilled again.
        with self.assertRaises(ValidationError):
            change_order_status(
                order_id=order_id,
                status='fulfilled',
                actor=self.admin
            )

        # Stock must remain unchanged.
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 6)

        # Only the original sale movement should exist.
        self.assertEqual(
            StockMovement.objects.filter(
                order_id=order_id,
                movement_type='sale'
            ).count(),
            1
        )

        self.assertFalse(
            StockMovement.objects.filter(
                order_id=order_id,
                movement_type='return'
            ).exists()
        )




    def test_low_stock_alerts_update_after_stock_movements(self):
        # Initially: stock = 10, threshold = 3.
        self.assertEqual(self.product.stock_status, 'healthy')

        dashboard = self.client.get('/api/dashboard/')
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.data['low_stock_count'], 0)

        # Remove 7 units: stock becomes 3 (low stock).
        response = self.client.post(
            '/api/inventory/adjust/',
            {
                'product': self.product.pk,
                'movement_type': 'out',
                'quantity': 7
            },
            format='json'
        )
        self.assertTrue(200 <= response.status_code < 300, response.data)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 3)
        self.assertEqual(self.product.stock_status, 'low')

        dashboard = self.client.get('/api/dashboard/')
        self.assertEqual(dashboard.data['low_stock_count'], 1)
        self.assertIn(
            self.product.pk,
            [p['id'] for p in dashboard.data['low_stock_products']]
        )

        # Remove remaining 3 units: stock becomes 0.
        response = self.client.post(
            '/api/inventory/adjust/',
            {
                'product': self.product.pk,
                'movement_type': 'out',
                'quantity': 3
            },
            format='json'
        )
        self.assertTrue(200 <= response.status_code < 300, response.data)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_status, 'out')

        # Dashboard still counts out-of-stock products.
        dashboard = self.client.get('/api/dashboard/')
        self.assertEqual(dashboard.data['low_stock_count'], 1)

        # Restock 5 units: product becomes healthy again.
        response = self.client.post(
            '/api/inventory/adjust/',
            {
                'product': self.product.pk,
                'movement_type': 'in',
                'quantity': 5
            },
            format='json'
        )
        self.assertTrue(200 <= response.status_code < 300, response.data)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 5)
        self.assertEqual(self.product.stock_status, 'healthy')

        dashboard = self.client.get('/api/dashboard/')
        self.assertEqual(dashboard.data['low_stock_count'], 0)





    
    def test_staff_can_cancel_unpaid_order_and_customer_is_restricted(self):
        # Admin creates an unpaid order.
        response = self.client.post(
            '/api/orders/',
            {
                'customer': self.customer.pk,
                'items': [
                    {'product': self.product.pk, 'quantity': 2}
                ]
            },
            format='json'
        )

        self.assertEqual(response.status_code, 201, response.data)
        order_id = response.data['id']

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)

        # Customers cannot cancel management orders.
        self.client.force_authenticate(user=self.regular)

        response = self.client.post(
            f'/api/orders/{order_id}/cancel/'
        )
        self.assertEqual(response.status_code, 403)

        # Customers cannot access management records.
        self.assertEqual(
            self.client.get('/api/customers/').status_code,
            403
        )
        self.assertEqual(
            self.client.get('/api/orders/').status_code,
            403
        )

        # Customers must not see internal product costs.
        response = self.client.get(
            f'/api/products/{self.product.pk}/'
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('cost', response.data)

        # Staff can cancel the unpaid order.
        self.client.force_authenticate(user=self.staff)

        response = self.client.post(
            f'/api/orders/{order_id}/cancel/'
        )
        self.assertEqual(response.status_code, 200, response.data)

        # Order status should change to cancelled.
        order = Order.objects.get(pk=order_id)
        self.assertEqual(order.status, Order.Status.CANCELLED)

        # Stock should be restored.
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

        # Verify inventory audit records.
        self.assertEqual(
            StockMovement.objects.filter(
                order_id=order_id,
                movement_type='sale'
            ).count(),
            1
        )
        self.assertEqual(
            StockMovement.objects.filter(
                order_id=order_id,
                movement_type='return'
            ).count(),
            1
        )

        # Staff cannot cancel the same order twice.
        response = self.client.post(
            f'/api/orders/{order_id}/cancel/'
        )
        self.assertEqual(response.status_code, 400)





    def test_order_inventory_dashboard_report_consistency(self):
        # Create an unpaid order for two products.
        response = self.client.post(
            '/api/orders/',
            {
                'customer': self.customer.pk,
                'items': [
                    {
                        'product': self.product.pk,
                        'quantity': 2
                    }
                ]
            },
            format='json'
        )

        self.assertEqual(response.status_code, 201, response.data)

        order_id = response.data['id']
        order = Order.objects.get(pk=order_id)

        expected_total = self.product.price * 2

        # Verify the stored order total.
        self.assertEqual(order.total, expected_total)

        # Verify inventory deduction.
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)

        # Verify exactly one sale movement.
        sale = StockMovement.objects.get(
            order_id=order_id,
            movement_type='sale'
        )
        self.assertEqual(sale.quantity, 2)

        # Verify dashboard totals.
        dashboard = self.client.get('/api/dashboard/')
        self.assertEqual(dashboard.status_code, 200)

        self.assertEqual(dashboard.data['total_orders'], 1)
        self.assertEqual(dashboard.data['stock_units'], 8)

        self.assertEqual(
            Decimal(str(dashboard.data['total_sales'])),
            expected_total
        )

        self.assertEqual(
            Decimal(str(dashboard.data['stock_value'])),
            self.product.cost * 8
        )

        # Verify sales report matches the dashboard.
        report = self.client.get('/api/reports/')
        self.assertEqual(report.status_code, 200)

        self.assertEqual(report.data['orders'], 1)
        self.assertEqual(
            Decimal(str(report.data['sales'])),
            expected_total
        )

        # Cancel the unpaid order.
        response = self.client.post(
            f'/api/orders/{order_id}/cancel/'
        )
        self.assertEqual(response.status_code, 200, response.data)

        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CANCELLED)

        # Inventory must return to its original quantity.
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

        # Verify stock restoration audit.
        returned = StockMovement.objects.get(
            order_id=order_id,
            movement_type='return'
        )
        self.assertEqual(returned.quantity, 2)

        # Cancelled orders must not count toward sales.
        dashboard = self.client.get('/api/dashboard/')
        self.assertEqual(dashboard.data['total_orders'], 0)
        self.assertEqual(
            Decimal(str(dashboard.data['total_sales'])),
            Decimal('0.00')
        )

        # Inventory valuation must be restored.
        self.assertEqual(dashboard.data['stock_units'], 10)
        self.assertEqual(
            Decimal(str(dashboard.data['stock_value'])),
            self.product.cost * 10
        )

        # Reports must also exclude the cancelled order.
        report = self.client.get('/api/reports/')
        self.assertEqual(report.data['orders'], 0)
        self.assertEqual(
            Decimal(str(report.data['sales'])),
            Decimal('0.00')
        )
