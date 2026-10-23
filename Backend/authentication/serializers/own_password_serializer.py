from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers


class OwnPasswordSerializer(serializers.Serializer):
    """Input for POST /api/auth/me/password/. Pass the signed-in user as context["user"]."""

    current_password = serializers.CharField(write_only=True, trim_whitespace=False, style={'input_type': 'password'})
    password = serializers.CharField(write_only=True, trim_whitespace=False, style={'input_type': 'password'})
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False, style={'input_type': 'password'})

    def validate_current_password(self, value):
        if not self.context['user'].check_password(value):
            raise serializers.ValidationError('Your current password is not correct.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': ['Passwords do not match.']})
        if attrs['password'] == attrs['current_password']:
            raise serializers.ValidationError({'password': ['Choose a password different from your current one.']})
        try:
            validate_password(attrs['password'], user=self.context['user'])
        except DjangoValidationError as error:
            raise serializers.ValidationError({'password': list(error.messages)}) from error
        return attrs
