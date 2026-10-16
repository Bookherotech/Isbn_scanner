from rest_framework import serializers

from authentication.managers import UserManager
from authentication.models import User

EMAIL_TAKEN = 'A user with this email already exists.'


class EmailChangeStartSerializer(serializers.Serializer):
    """Input for POST /api/auth/staff/<id>/email-change/. Pass the staff member as context["staff"]."""

    new_email = serializers.EmailField(max_length=254)

    def validate_new_email(self, value):
        email = UserManager.normalize_email(value)
        if email == self.context['staff'].email:
            raise serializers.ValidationError('That is already their email.')
        if User.objects.filter(email=email).exists():  # one lookup on the unique email index
            raise serializers.ValidationError(EMAIL_TAKEN)
        return email
