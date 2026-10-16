from django.db import IntegrityError, transaction
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.exceptions import OtpError
from authentication.models import ActionOTP, User
from authentication.permissions import IsAdminRole
from authentication.serializers import OtpVerifySerializer, UserSerializer
from authentication.services import get_staff_or_404, mask_email, start_action_code, verify_action_code
from authentication.throttles import ActionCodeCheckThrottle

EMAIL_TAKEN = 'A user with this email already exists.'


class StaffEmailChangeConfirmView(APIView):
    """Step 2 (Admin only): the admin enters the code from their inbox.

    POST /api/auth/staff/<id>/email-change/confirm/ {challenge, otp}
    A correct code changes the staff member's email and marks it "not verified". A second code is
    then sent to the NEW address (confirm it at /email-verification/confirm/).
    -> {user, verification: {challenge, email_hint, expires_in} | null}
    """

    permission_classes = [IsAdminRole]
    throttle_classes = [ActionCodeCheckThrottle]

    def post(self, request, pk):
        staff = get_staff_or_404(pk)
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        admin = request.user
        approval = verify_action_code(ActionOTP.Purpose.EMAIL_CHANGE, admin, staff, serializer.validated_data['challenge'], serializer.validated_data['otp'])

        new_email = approval.new_email
        if User.objects.filter(email=new_email).exclude(pk=staff.pk).exists():  # taken since the code was requested
            raise serializers.ValidationError({'new_email': [EMAIL_TAKEN]})
        staff.email = new_email
        staff.email_verified = False
        try:
            with transaction.atomic():
                staff.save(update_fields=['email', 'email_verified', 'updated_at'])
        except IntegrityError as error:
            raise serializers.ValidationError({'new_email': [EMAIL_TAKEN]}) from error

        # Second code: to the new address, to prove it is real. If the mail cannot be sent right now the
        # change still stands and the admin can ask for the code again (email-verification endpoint).
        verification = None
        try:
            challenge = start_action_code(
                ActionOTP.Purpose.EMAIL_VERIFY, actor=admin, subject=staff, to_email=staff.email, name=staff.full_name or staff.email
            )
            verification = {'challenge': challenge.token, 'email_hint': mask_email(staff.email), 'expires_in': challenge.expires_in}
        except OtpError:
            pass
        return Response({'user': UserSerializer(staff).data, 'verification': verification})
