from django.urls import path

from book_admin.views import ActivityListView

urlpatterns = [
    path('activity/', ActivityListView.as_view(), name='activity'),
]
