def display_name(user):
    """What the admin screens show for a person: the full name, else the part of the email before the @."""
    if user is None:
        return 'Unknown'
    return user.full_name or user.email.split('@')[0]
