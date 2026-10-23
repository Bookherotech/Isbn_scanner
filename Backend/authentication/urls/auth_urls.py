from django.urls import path

from authentication.views import (
    LoginView,
    MePasswordView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    PasswordResetVerifyView,
    RefreshView,
    ResendOtpView,
    VerifyOtpView,
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('login/verify-otp/', VerifyOtpView.as_view(), name='verify-otp'),
    path('login/resend-otp/', ResendOtpView.as_view(), name='resend-otp'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('password-reset/verify/', PasswordResetVerifyView.as_view(), name='password-reset-verify'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('token/refresh/', RefreshView.as_view(), name='token-refresh'),
    path('me/', MeView.as_view(), name='me'),
    path('me/password/', MePasswordView.as_view(), name='me-password'),
]
