from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from authentication.forms import UserChangeForm, UserCreationForm
from authentication.models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserChangeForm
    add_form = UserCreationForm

    ordering = ('-id',)
    list_display = ('email', 'full_name', 'role', 'is_active', 'is_superuser')
    list_filter = ('role', 'is_active', 'is_superuser')
    search_fields = ('^email',)  # "starts with": can use the email index
    show_full_result_count = False  # skips the extra COUNT(*) on big tables
    list_per_page = 50

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Profile', {'fields': ('full_name', 'role')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('email', 'full_name', 'role', 'password1', 'password2')}),
    )
    filter_horizontal = ('groups', 'user_permissions')
