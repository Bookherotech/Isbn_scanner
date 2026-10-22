from datetime import timedelta

# How long a sign-in lasts without being used (each refresh of the access token restarts the clock).
REMEMBER_ME_SESSION_LIFETIME = timedelta(days=30)  # "Remember me" ticked
SHORT_SESSION_LIFETIME = timedelta(hours=12)  # "Remember me" not ticked
