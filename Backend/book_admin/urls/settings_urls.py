from django.urls import path

from book_admin.views import GenreListView, SettingsView

urlpatterns = [
    path('settings/', SettingsView.as_view(), name='settings'),
    path('genres/', GenreListView.as_view(), name='genres'),
]
