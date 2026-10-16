from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from authentication.validators import clean_phone_number, validate_phone_number


class ProfileUpdateSerializer(serializers.Serializer):
    """Input for PATCH /api/auth/me/: the signed-in user edits their own name and phone.

    The email, role and status are not fields here, so they can never be changed from this endpoint.
    """

    full_name = serializers.CharField(max_length=150)
    phone_number = serializers.CharField(max_length=30)

    def validate_phone_number(self, value):
        phone = clean_phone_number(value)
        try:
            validate_phone_number(phone)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages) from error
        return phone

    def update(self, instance, validated_data):
        changed = [field for field, value in validated_data.items() if getattr(instance, field) != value]
        for field in changed:
            setattr(instance, field, validated_data[field])
        if changed:
            instance.save(update_fields=[*changed, 'updated_at'])  # write only what changed
        return instance
