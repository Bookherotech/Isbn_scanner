from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from authentication.services import load_reset_user


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Input for POST /api/auth/password-reset/confirm/. On success `validated_data["user"]` is the account."""

    reset_token = serializers.CharField(max_length=500)
    password = serializers.CharField(write_only=True, trim_whitespace=False, style={'input_type': 'password'})
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False, style={'input_type': 'password'})

    def validate(self, attrs):
        user = load_reset_user(attrs['reset_token'])  # raises when the ticket is wrong, expired or already used
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': ['Passwords do not match.']})
        try:
            validate_password(attrs['password'], user=user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({'password': list(error.messages)}) from error
        attrs['user'] = user
        return attrs
