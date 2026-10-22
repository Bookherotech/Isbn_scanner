"""
URL configuration for main project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from decouple import config

# Django's own admin panel. Not /admin/: that address belongs to the Super Admin pages of the React app.
DJANGO_ADMIN_PATH = config('DJANGO_ADMIN_PATH', default='django-admin/').strip('/') + '/'

urlpatterns = [
    path(DJANGO_ADMIN_PATH, admin.site.urls),
    path('api/auth/', include('authentication.urls')),
    path('api/staff/', include('staff_api.urls')),
]

# Cover photos while developing (static() adds nothing when DEBUG is off; production serves /media/ itself)
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
