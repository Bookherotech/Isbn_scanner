from rest_framework import serializers


class PasswordResetRequestSerializer(serializers.Serializer):
    """Input for POST /api/auth/password-reset/."""

    email = serializers.EmailField(max_length=254)
