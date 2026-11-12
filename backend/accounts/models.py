from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    class Roles(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        MANAGER = 'manager', 'Manager'
        STAFF = 'staff', 'Staff'
        USER = 'user', 'User'

    role = models.CharField(max_length=10, choices=Roles.choices, default=Roles.USER)
    email = models.EmailField(unique=True)

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = self.Roles.ADMIN
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.username} ({self.role})'
