"""Notification routes, for Admin and Staff alike. Included in main/urls.py as: path('api/notifications/', include('book_admin.urls.notification_urls'))"""

from django.urls import path

from book_admin.views import MarkAllReadView, MarkReadView, NotificationListView, UnreadCountView

urlpatterns = [
    path('', NotificationListView.as_view(), name='notification-list'),
    path('unread-count/', UnreadCountView.as_view(), name='notification-unread-count'),
    path('read-all/', MarkAllReadView.as_view(), name='notification-read-all'),
    path('<int:pk>/read/', MarkReadView.as_view(), name='notification-read'),
]
