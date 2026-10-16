from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework import serializers

from authentication.constants import Role
from authentication.managers import UserManager
from authentication.models import User
from authentication.validators import clean_phone_number, validate_phone_number

EMAIL_TAKEN = 'A user with this email already exists.'


class StaffCreateSerializer(serializers.Serializer):
    """Input for POST /api/auth/staff/ (Admin only): creates a Staff user who signs in with email + password."""

    full_name = serializers.CharField(max_length=150)
    phone_number = serializers.CharField(max_length=30)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, trim_whitespace=False, style={'input_type': 'password'})
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False, style={'input_type': 'password'})

    def validate_phone_number(self, value):
        phone = clean_phone_number(value)
        try:
            validate_phone_number(phone)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages) from error
        return phone

    def validate_email(self, value):
        email = UserManager.normalize_email(value)
        if User.objects.filter(email=email).exists():  # one lookup on the unique email index
            raise serializers.ValidationError(EMAIL_TAKEN)
        return email

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': ['Passwords do not match.']})
        candidate = User(email=attrs['email'], full_name=attrs['full_name'])  # lets the "too similar" check see them
        try:
            validate_password(attrs['password'], user=candidate)
        except DjangoValidationError as error:
            raise serializers.ValidationError({'password': list(error.messages)}) from error
        return attrs

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        try:
            return User.objects.create_user(role=Role.STAFF, **validated_data)
        except IntegrityError as error:  # someone created the same email a moment ago
            raise serializers.ValidationError({'email': [EMAIL_TAKEN]}) from error
