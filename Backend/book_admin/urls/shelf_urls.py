from django.urls import path

from book_admin.views import ShelfDetailView, ShelfListView

urlpatterns = [
    path('shelves/', ShelfListView.as_view(), name='shelf-list'),
    path('shelves/<str:code>/', ShelfDetailView.as_view(), name='shelf-detail'),
]
