from rest_framework import serializers

from authentication.models import User


class UserSerializer(serializers.ModelSerializer):
    """Read-only user payload. Uses only columns on the user row, so it never triggers extra queries."""

    class Meta:
        model = User
        fields = ['id', 'email', 'email_verified', 'full_name', 'phone_number', 'role', 'is_active', 'last_login', 'date_joined']
        read_only_fields = fields
