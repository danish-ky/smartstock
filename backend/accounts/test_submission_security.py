"""Focused submission QA: JWT logout and archived-product authorization.

Run with:
    python manage.py test accounts.test_submission_security --verbosity 1

Django's test runner uses a separate test database. No production data is used.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from inventory.models import Category, Product


class SubmissionSecurityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.password = "QAOnlyStrongPassword123!"
        cls.users = {
            role: User.objects.create_user(
                username=f"submission_{role}",
                email=f"submission_{role}@example.com",
                password=cls.password,
                role=role,
            )
            for role in ("admin", "manager", "staff", "user")
        }
        cls.category = Category.objects.create(name="Submission QA Category")
        cls.active_product = Product.objects.create(
            name="Submission Active Product",
            sku="SUB-QA-ACTIVE",
            category=cls.category,
            price=Decimal("100.00"),
            cost=Decimal("50.00"),
            stock=0,
            low_stock_threshold=3,
            is_active=True,
        )
        cls.archived_product = Product.objects.create(
            name="Submission Archived Product",
            sku="SUB-QA-ARCHIVED",
            category=cls.category,
            price=Decimal("100.00"),
            cost=Decimal("50.00"),
            stock=0,
            low_stock_threshold=3,
            is_active=False,
        )

    @staticmethod
    def product_skus(response):
        payload = response.data
        rows = payload["results"] if isinstance(payload, dict) else payload
        return {row["sku"] for row in rows}

    def login_admin(self):
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"username": "submission_admin", "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return client, response.data["refresh"]

    def test_logout_blacklists_refresh_token(self):
        client, refresh = self.login_admin()
        response = client.post("/api/auth/logout/", {"refresh": refresh}, format="json")
        self.assertEqual(response.status_code, 205, response.data)
        replay = APIClient().post("/api/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(replay.status_code, 401, replay.data)

        # JWT access tokens remain valid until their normal expiry after logout.
        self.assertEqual(client.get("/api/auth/me/").status_code, 200)

    def test_logout_requires_authentication(self):
        anonymous = APIClient()
        response = anonymous.post("/api/auth/logout/", {"refresh": "not-a-token"}, format="json")
        self.assertEqual(response.status_code, 401, response.data)

    def test_logout_rejects_missing_and_invalid_refresh(self):
        client, _ = self.login_admin()
        missing = client.post("/api/auth/logout/", {}, format="json")
        self.assertEqual(missing.status_code, 400, missing.data)
        invalid = client.post("/api/auth/logout/", {"refresh": "invalid-token"}, format="json")
        self.assertEqual(invalid.status_code, 400, invalid.data)

    def test_archived_catalog_visibility_across_four_roles(self):
        for role, user in self.users.items():
            with self.subTest(role=role):
                client = APIClient()
                client.force_authenticate(user=user)
                normal = client.get("/api/products/")
                self.assertEqual(normal.status_code, 200, normal.data)
                self.assertIn(self.active_product.sku, self.product_skus(normal))
                self.assertNotIn(self.archived_product.sku, self.product_skus(normal))

                include = client.get("/api/products/?include_inactive=true")
                self.assertEqual(include.status_code, 200, include.data)
                self.assertIn(self.active_product.sku, self.product_skus(include))
                if role == "user":
                    self.assertNotIn(self.archived_product.sku, self.product_skus(include))
                else:
                    self.assertIn(self.archived_product.sku, self.product_skus(include))

        anon = APIClient().get("/api/products/?include_inactive=true")
        self.assertEqual(anon.status_code, 401, anon.data)

    def test_archiving_requires_management_role_and_preserves_record(self):
        for role in ("staff", "user"):
            with self.subTest(role=role):
                client = APIClient()
                client.force_authenticate(user=self.users[role])
                denied = client.delete(f"/api/products/{self.active_product.pk}/")
                self.assertEqual(denied.status_code, 403, denied.data)

        admin = APIClient()
        admin.force_authenticate(user=self.users["admin"])
        archived = admin.delete(f"/api/products/{self.active_product.pk}/")
        self.assertEqual(archived.status_code, 204, archived.data)
        self.active_product.refresh_from_db()
        self.assertFalse(self.active_product.is_active)
        self.assertTrue(Product.objects.filter(pk=self.active_product.pk).exists())
        normal = admin.get("/api/products/")
        self.assertNotIn(self.active_product.sku, self.product_skus(normal))
        include = admin.get("/api/products/?include_inactive=true")
        self.assertIn(self.active_product.sku, self.product_skus(include))
