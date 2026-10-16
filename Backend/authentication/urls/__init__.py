"""URL routes - one file per feature, combined here.

Included in main/urls.py as: path('api/auth/', include('authentication.urls'))
"""

from .auth_urls import urlpatterns as auth_urlpatterns
from .user_urls import urlpatterns as user_urlpatterns

app_name = 'authentication'

urlpatterns = [*auth_urlpatterns, *user_urlpatterns]
