from django.contrib.auth.forms import UserChangeForm as BaseUserChangeForm

from authentication.models import User


class UserChangeForm(BaseUserChangeForm):
    """Django admin "change user" form bound to the email-based user."""

    class Meta:
        model = User
        fields = '__all__'
