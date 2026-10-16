from django.urls import path

from authentication.views import LoginView, MeView, RefreshView, ResendOtpView, VerifyOtpView

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('login/verify-otp/', VerifyOtpView.as_view(), name='verify-otp'),
    path('login/resend-otp/', ResendOtpView.as_view(), name='resend-otp'),
    path('token/refresh/', RefreshView.as_view(), name='token-refresh'),
    path('me/', MeView.as_view(), name='me'),
]
