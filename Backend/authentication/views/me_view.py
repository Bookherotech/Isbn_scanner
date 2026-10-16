from rest_framework.generics import RetrieveAPIView

from authentication.serializers import UserSerializer


class MeView(RetrieveAPIView):
    """GET /api/auth/me/ -> the signed-in user (already loaded by the auth step: 0 extra queries)."""

    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user
