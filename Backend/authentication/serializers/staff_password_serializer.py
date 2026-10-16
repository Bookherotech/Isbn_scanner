from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers


class StaffPasswordSerializer(serializers.Serializer):
    """Input for POST /api/auth/staff/<id>/password/. Pass the staff member as context["staff"]."""

    password = serializers.CharField(write_only=True, trim_whitespace=False, style={'input_type': 'password'})
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False, style={'input_type': 'password'})

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': ['Passwords do not match.']})
        try:
            validate_password(attrs['password'], user=self.context['staff'])  # also checks "too similar to their email/name"
        except DjangoValidationError as error:
            raise serializers.ValidationError({'password': list(error.messages)}) from error
        return attrs
