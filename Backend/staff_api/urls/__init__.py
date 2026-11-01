"""Staff portal routes. Included in main/urls.py as: path('api/staff/', include('staff_api.urls'))"""

from django.urls import path

from staff_api.views import BookSearchView, IsbnDescriptionView, IsbnLookupView, ShelfListView, StaffHomeView, SubmissionDetailView, SubmissionListView

app_name = 'staff_api'

urlpatterns = [
    path('home/', StaffHomeView.as_view(), name='home'),
    path('isbn/<str:isbn>/', IsbnLookupView.as_view(), name='isbn-lookup'),
    path('isbn/<str:isbn>/description/', IsbnDescriptionView.as_view(), name='isbn-description'),
    path('book-search/', BookSearchView.as_view(), name='book-search'),
    path('shelves/', ShelfListView.as_view(), name='shelves'),
    path('submissions/', SubmissionListView.as_view(), name='submissions'),
    path('submissions/<int:pk>/', SubmissionDetailView.as_view(), name='submission-detail'),
]
