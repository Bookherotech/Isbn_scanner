from django.urls import path

from authentication.views import UserListView

urlpatterns = [
    path('users/', UserListView.as_view(), name='user-list'),
]
