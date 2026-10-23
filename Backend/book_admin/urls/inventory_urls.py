from django.urls import path

from book_admin.views import (
    AuthorListView, BookApproveView, BookDetailView, BookListView, BookRejectView, OutOfStockView, RejectionReasonListView, WaitingApproveView, WaitingListView,
)

urlpatterns = [
    path('books/', BookListView.as_view(), name='book-list'),
    path('books/<int:pk>/', BookDetailView.as_view(), name='book-detail'),
    path('books/<int:pk>/approve/', BookApproveView.as_view(), name='book-approve'),
    path('books/<int:pk>/reject/', BookRejectView.as_view(), name='book-reject'),
    path('rejection-reasons/', RejectionReasonListView.as_view(), name='rejection-reasons'),
    path('authors/', AuthorListView.as_view(), name='author-list'),
    path('waiting-list/', WaitingListView.as_view(), name='waiting-list'),
    path('waiting-list/<int:pk>/approve/', WaitingApproveView.as_view(), name='waiting-approve'),
    path('out-of-stock/', OutOfStockView.as_view(), name='out-of-stock'),
]
