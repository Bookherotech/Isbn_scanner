from django.contrib.auth.forms import BaseUserCreationForm

from authentication.models import User


class UserCreationForm(BaseUserCreationForm):
    """Django admin "add user" form for the email-based user (Django's default one expects a username)."""

    class Meta:
        model = User
        fields = ('email', 'full_name', 'role')
