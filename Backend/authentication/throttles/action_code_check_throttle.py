from rest_framework.throttling import UserRateThrottle


class ActionCodeCheckThrottle(UserRateThrottle):
    """Per signed-in admin: limits code checks. The per-code attempt limit (5) is the real guard."""

    scope = 'action_code_check'
    rate = '10/min'
