import re

from django.core.exceptions import ValidationError

# "+", a country code (cannot start with 0) and the number: 7-15 digits in total (ITU E.164).
E164 = re.compile(r'^\+[1-9]\d{6,14}$')
SEPARATORS = re.compile(r'[\s\-().]')


def clean_phone_number(value):
    """+91 98765-43210 -> +919876543210 (spaces, dashes, dots and brackets are dropped)."""
    return SEPARATORS.sub('', value or '')


def validate_phone_number(value):
    if not E164.match(value or ''):
        raise ValidationError('Enter the phone number with its country code, for example +919876543210.', code='invalid_phone')
