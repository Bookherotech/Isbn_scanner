from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.response import Response

from authentication.serializers import ProfileUpdateSerializer, UserSerializer


class MeView(RetrieveUpdateAPIView):
    """The signed-in user's own profile.

    GET   /api/auth/me/                     -> the user (already loaded by the auth step: 0 extra queries)
    PATCH /api/auth/me/ {full_name, phone_number} -> update name / phone. The email cannot be changed.
    """

    http_method_names = ['get', 'patch', 'head', 'options']

    def get_serializer_class(self):
        return ProfileUpdateSerializer if self.request.method == 'PATCH' else UserSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data)
