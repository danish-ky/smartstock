"""Additional SmartStock four-role authentication and authorization tests.

Copy this file to backend/accounts/tests.py. It only adds tests; no application
code or database migrations are changed.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from inventory.models import Category


class FourRoleAccessTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.password = "LongTestingPassword123!"
        for role in ("admin", "manager", "staff", "user"):
            User.objects.create_user(
                username=f"role_{role}",
                email=f"role_{role}@example.com",
                password=cls.password,
                role=role,
            )
        User.objects.create_user(
            username="role_disabled",
            email="role_disabled@example.com",
            password=cls.password,
            role="staff",
            is_active=False,
        )
        cls.category = Category.objects.create(name="Four Role Test Category")

    def login_as(self, role):
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"username": f"role_{role}", "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return client

    def test_all_four_roles_use_the_same_login_endpoint(self):
        for role in ("admin", "manager", "staff", "user"):
            with self.subTest(role=role):
                client = self.login_as(role)
                me = client.get("/api/auth/me/")
                self.assertEqual(me.status_code, 200, me.data)
                self.assertEqual(me.data["role"], role)
                self.assertEqual(me.data["username"], f"role_{role}")

    def test_anonymous_users_cannot_read_products(self):
        client = APIClient()
        self.assertEqual(client.get("/api/products/").status_code, 401)

    def test_incorrect_password_and_disabled_account_are_rejected(self):
        client = APIClient()
        wrong = client.post(
            "/api/auth/login/",
            {"username": "role_staff", "password": "WrongPassword123!"},
            format="json",
        )
        self.assertEqual(wrong.status_code, 401)
        disabled = client.post(
            "/api/auth/login/",
            {"username": "role_disabled", "password": self.password},
            format="json",
        )
        self.assertEqual(disabled.status_code, 401)

    def test_admin_alone_has_team_management_access(self):
        for role in ("admin", "manager", "staff", "user"):
            with self.subTest(role=role):
                client = self.login_as(role)
                response = client.get("/api/users/")
                expected = 200 if role == "admin" else 403
                self.assertEqual(response.status_code, expected, response.data)

    def test_reports_are_available_only_to_admin_and_manager(self):
        for role in ("admin", "manager", "staff", "user"):
            with self.subTest(role=role):
                client = self.login_as(role)
                response = client.get("/api/reports/")
                expected = 200 if role in ("admin", "manager") else 403
                self.assertEqual(response.status_code, expected, response.data)

    def test_every_role_can_view_the_product_catalog(self):
        for role in ("admin", "manager", "staff", "user"):
            with self.subTest(role=role):
                client = self.login_as(role)
                response = client.get("/api/products/")
                self.assertEqual(response.status_code, 200, response.data)

    def test_only_admin_and_manager_can_create_products(self):
        for role in ("admin", "manager", "staff", "user"):
            with self.subTest(role=role):
                client = self.login_as(role)
                response = client.post(
                    "/api/products/",
                    {
                        "name": f"Role Test Product {role}",
                        "sku": f"ROLE-{role.upper()}",
                        "category": self.category.id,
                        "price": "100.00",
                        "cost": "50.00",
                    },
                    format="json",
                )
                expected = 201 if role in ("admin", "manager") else 403
                self.assertEqual(response.status_code, expected, response.data)
