from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.serializers import OwnPasswordSerializer
from authentication.services import issue_tokens
from authentication.throttles import ActionCodeCheckThrottle


class MePasswordView(APIView):
    """The signed-in user changes their own password.

    POST /api/auth/me/password/ {current_password, password, confirm_password} -> {access, refresh, user}
    Every other session is signed out (tokens are tied to the old password); this one gets fresh tokens
    so it stays signed in, keeping its "Remember me" choice.
    """

    throttle_classes = [ActionCodeCheckThrottle]  # slows down guessing the current password

    def post(self, request):
        user = request.user
        serializer = OwnPasswordSerializer(data=request.data, context={'user': user})
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data['password'])
        user.save(update_fields=['password', 'updated_at'])
        remember = request.auth.get('remember', True) if request.auth is not None else False
        return Response(issue_tokens(user, remember=remember))
