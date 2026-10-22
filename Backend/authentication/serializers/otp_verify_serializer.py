from rest_framework import serializers

from authentication.constants import OTP_LENGTH


class OtpVerifySerializer(serializers.Serializer):
    """Input for POST /api/auth/login/verify-otp/."""

    challenge = serializers.CharField(max_length=128)
    otp = serializers.RegexField(
        regex=rf'^\d{{{OTP_LENGTH}}}$',
        error_messages={'invalid': f'Enter the {OTP_LENGTH}-digit code.'},
    )
    remember = serializers.BooleanField(required=False, default=False)  # "Remember me" from the sign-in form
