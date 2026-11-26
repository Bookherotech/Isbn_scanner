from django.urls import path

from book_admin.views import IsbnRefreshView

urlpatterns = [
    path('isbn/<str:isbn>/refresh/', IsbnRefreshView.as_view(), name='isbn-refresh'),
]
