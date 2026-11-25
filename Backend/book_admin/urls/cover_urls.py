from django.urls import path

from book_admin.views import BookCoverView, CoverListView, CoverReleaseView

urlpatterns = [
    path('covers/', CoverListView.as_view(), name='cover-list'),
    path('covers/release/', CoverReleaseView.as_view(), name='cover-release'),
    path('books/<int:pk>/cover/', BookCoverView.as_view(), name='book-cover'),
]
