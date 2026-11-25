from django.urls import path

from book_admin.views import BlockedBookDetailView, BlockedBookListView, BlockedBookLookupView

urlpatterns = [
    path('blocked-books/', BlockedBookListView.as_view(), name='blocked-book-list'),
    path('blocked-books/lookup/<str:isbn>/', BlockedBookLookupView.as_view(), name='blocked-book-lookup'),
    path('blocked-books/<int:pk>/', BlockedBookDetailView.as_view(), name='blocked-book-detail'),
]
