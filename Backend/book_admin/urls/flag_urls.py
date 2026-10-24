from django.urls import path

from book_admin.views import BookFlagReviewView, FlagCategoryDetailView, FlagCategoryListView, FlaggedBookListView

urlpatterns = [
    path('flag-categories/', FlagCategoryListView.as_view(), name='flag-category-list'),
    path('flag-categories/<int:pk>/', FlagCategoryDetailView.as_view(), name='flag-category-detail'),
    path('flagged/', FlaggedBookListView.as_view(), name='flagged'),
    path('books/<int:pk>/flag-review/', BookFlagReviewView.as_view(), name='book-flag-review'),
]
