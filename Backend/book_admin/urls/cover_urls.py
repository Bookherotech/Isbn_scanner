from django.urls import path

from book_admin.views import BookCoverView, CoverListView

urlpatterns = [
    path('covers/', CoverListView.as_view(), name='cover-list'),
    path('books/<int:pk>/cover/', BookCoverView.as_view(), name='book-cover'),
]
