from rest_framework import serializers


class OtpResendSerializer(serializers.Serializer):
    """Input for POST /api/auth/login/resend-otp/."""

    challenge = serializers.CharField(max_length=128)
