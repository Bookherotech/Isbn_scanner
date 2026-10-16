from django.core import signing

from authentication.exceptions import InvalidResetToken
from authentication.models import User

SALT = 'authentication.password-reset'
MAX_AGE_SECONDS = 10 * 60  # after the code is right, the person has 10 minutes to choose the new password


def issue_reset_token(user):
    """A signed, short-lived ticket that says "this person proved they own this inbox".

    It carries a fingerprint of the current password, so it stops working the moment the password
    changes: the ticket can be used only once, and nothing needs to be stored.
    """
    return signing.dumps({'uid': user.pk, 'pw': user.get_session_auth_hash()}, salt=SALT)


def load_reset_user(token):
    """The user a valid, unexpired, unused ticket belongs to; raises InvalidResetToken otherwise."""
    try:
        data = signing.loads(token, salt=SALT, max_age=MAX_AGE_SECONDS)
    except signing.BadSignature as error:  # also covers an expired signature
        raise InvalidResetToken() from error
    user = User.objects.filter(pk=data.get('uid'), is_active=True).first()
    if user is None or user.get_session_auth_hash() != data.get('pw'):
        raise InvalidResetToken()
    return user
