from django.urls import path

from book_admin.views import (
    AuthorListView, BookApproveAllView, BookApproveView, BookDetailView, BookListView, BookRejectAllView, BookRejectView, OutOfStockView, RejectionReasonListView, WaitingApproveView, WaitingListView,
)

urlpatterns = [
    path('books/', BookListView.as_view(), name='book-list'),
    path('books/approve-all/', BookApproveAllView.as_view(), name='book-approve-all'),
    path('books/reject-all/', BookRejectAllView.as_view(), name='book-reject-all'),
    path('books/<int:pk>/', BookDetailView.as_view(), name='book-detail'),
    path('books/<int:pk>/approve/', BookApproveView.as_view(), name='book-approve'),
    path('books/<int:pk>/reject/', BookRejectView.as_view(), name='book-reject'),
    path('rejection-reasons/', RejectionReasonListView.as_view(), name='rejection-reasons'),
    path('authors/', AuthorListView.as_view(), name='author-list'),
    path('waiting-list/', WaitingListView.as_view(), name='waiting-list'),
    path('waiting-list/<int:pk>/approve/', WaitingApproveView.as_view(), name='waiting-approve'),
    path('out-of-stock/', OutOfStockView.as_view(), name='out-of-stock'),
]
