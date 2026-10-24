from django.urls import path

from book_admin.views import DashboardView, FilterOptionsView, NavCountsView, ReportView, SearchView

urlpatterns = [
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('nav-counts/', NavCountsView.as_view(), name='nav-counts'),
    path('search/', SearchView.as_view(), name='search'),
    path('options/', FilterOptionsView.as_view(), name='options'),
    path('reports/', ReportView.as_view(), name='reports'),
]
