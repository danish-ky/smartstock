from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User

@admin.register(User)
class SmartUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (('SmartStock role', {'fields': ('role',)}),)
    add_fieldsets = UserAdmin.add_fieldsets + (('SmartStock role', {'fields': ('email', 'role')}),)
    list_display = ('username', 'email', 'role', 'is_active', 'is_staff')
    list_filter = ('role', 'is_active', 'is_staff')
