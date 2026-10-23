from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsAdminRole
from book_admin.models import ActivityLog, AppSettings
from book_admin.serializers import SettingsSerializer
from book_admin.services.activity_service import log_activity


class SettingsView(APIView):
    """GET   /api/admin/settings/  -> store name / domain / location, Shopify connection, stock-check interval, reminder delay
    PATCH /api/admin/settings/  {store_name?, store_domain?, store_location?, shopify_connected?, stock_poll_minutes?, reminder_after_hours?}
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(SettingsSerializer(AppSettings.load()).data)

    def patch(self, request):
        current = AppSettings.load()
        serializer = SettingsSerializer(current, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        changed = [f for f, v in serializer.validated_data.items() if getattr(current, f) != v]
        serializer.save()
        if changed:
            log_activity(action='Updated settings', kind=ActivityLog.Kind.SETTINGS, target='Settings', detail=', '.join(c.replace('_', ' ') for c in changed),
                         actor=request.user, result=ActivityLog.Result.INFO)
        return Response(serializer.data)
