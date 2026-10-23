from django.urls import path

from authentication.views import (
    AdminTransferApproveView,
    AdminTransferCompleteView,
    AdminTransferResendView,
    AdminTransferStartView,
    StaffCreateView,
    StaffDetailView,
    StaffEmailChangeConfirmView,
    StaffEmailChangeView,
    StaffEmailVerificationConfirmView,
    StaffEmailVerificationView,
    StaffPasswordView,
)

urlpatterns = [
    path('staff/', StaffCreateView.as_view(), name='staff-create'),
    path('staff/<int:pk>/', StaffDetailView.as_view(), name='staff-detail'),
    path('staff/<int:pk>/password/', StaffPasswordView.as_view(), name='staff-password'),
    path('staff/<int:pk>/email-change/', StaffEmailChangeView.as_view(), name='staff-email-change'),
    path('staff/<int:pk>/email-change/confirm/', StaffEmailChangeConfirmView.as_view(), name='staff-email-change-confirm'),
    path('staff/<int:pk>/email-verification/', StaffEmailVerificationView.as_view(), name='staff-email-verification'),
    path('staff/<int:pk>/email-verification/confirm/', StaffEmailVerificationConfirmView.as_view(), name='staff-email-verification-confirm'),
    # Make a staff member the Super Admin: a code from the current Super Admin, then a code from the staff member
    path('staff/<int:pk>/admin-transfer/', AdminTransferStartView.as_view(), name='admin-transfer'),
    path('staff/<int:pk>/admin-transfer/approve/', AdminTransferApproveView.as_view(), name='admin-transfer-approve'),
    path('staff/<int:pk>/admin-transfer/resend/', AdminTransferResendView.as_view(), name='admin-transfer-resend'),
    path('staff/<int:pk>/admin-transfer/complete/', AdminTransferCompleteView.as_view(), name='admin-transfer-complete'),
]
