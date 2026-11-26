"""Admin portal routes - one file per feature, combined here.

Included in main/urls.py as: path('api/admin/', include('book_admin.urls'))
Notifications (Admin and Staff) are separate: path('api/notifications/', include('book_admin.urls.notification_urls'))
"""

from .activity_urls import urlpatterns as activity_urlpatterns
from .blocked_urls import urlpatterns as blocked_urlpatterns
from .cover_urls import urlpatterns as cover_urlpatterns
from .dashboard_urls import urlpatterns as dashboard_urlpatterns
from .flag_urls import urlpatterns as flag_urlpatterns
from .inventory_urls import urlpatterns as inventory_urlpatterns
from .lookup_urls import urlpatterns as lookup_urlpatterns
from .settings_urls import urlpatterns as settings_urlpatterns
from .shelf_urls import urlpatterns as shelf_urlpatterns

app_name = 'book_admin'

urlpatterns = [*dashboard_urlpatterns, *inventory_urlpatterns, *shelf_urlpatterns, *activity_urlpatterns, *settings_urlpatterns, *flag_urlpatterns, *blocked_urlpatterns, *cover_urlpatterns, *lookup_urlpatterns]
