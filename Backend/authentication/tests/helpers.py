import re

from django.core import mail
from django.urls import reverse


def latest_code():
    """The 4-digit code from the most recent email in the test outbox."""
    return re.search(r'Your code: (\d{4})', mail.outbox[-1].body).group(1)


def sign_in(client, email, password):
    """Log in the way a real client does, including the OTP step for a Super Admin. Returns the final response."""
    response = client.post(reverse('authentication:login'), {'email': email, 'password': password}, format='json')
    if response.status_code == 200 and response.data.get('otp_required'):
        response = client.post(
            reverse('authentication:verify-otp'),
            {'challenge': response.data['challenge'], 'otp': latest_code()},
            format='json',
        )
    return response
