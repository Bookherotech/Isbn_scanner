from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from authentication.validators import clean_phone_number, validate_phone_number


class StaffUpdateSerializer(serializers.Serializer):
    """Input for PATCH /api/auth/staff/<id>/ (Admin only). Send any of the fields below.

    `is_active` is how an admin activates or deactivates a staff member. The email, role and password
    are not fields here: the email changes only through the two-code flow (email-change endpoints),
    the password through /password/.
    """

    full_name = serializers.CharField(max_length=150)
    phone_number = serializers.CharField(max_length=30)
    is_active = serializers.BooleanField()

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
