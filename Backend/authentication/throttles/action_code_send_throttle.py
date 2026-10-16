from rest_framework.throttling import UserRateThrottle


class ActionCodeSendThrottle(UserRateThrottle):
    """Per signed-in admin: limits how often confirmation emails can be requested."""

    scope = 'action_code_send'
    rate = '6/min'
