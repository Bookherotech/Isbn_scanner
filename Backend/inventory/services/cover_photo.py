"""Staff cover photos: checked and re-saved as a clean JPEG before they are stored."""

import base64
import binascii
import io
import re
import uuid

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 1_500_000  # the browser sends ~100-300 KB; this also stays under Django's 2.5 MB request limit
MAX_PIXELS = 40_000_000  # refuse "decompression bombs" (tiny files that expand to huge images)
LONG_SIDE = 1600
DATA_URL = re.compile(r'data:image/(?:jpeg|jpg|png|webp);base64,(?P<data>[A-Za-z0-9+/=\s]+)', re.IGNORECASE)


class InvalidCoverPhoto(ValueError):
    """The upload is not a usable image; the message is shown to staff."""


def clean_cover_photo(data_url):
    """A 'data:image/...;base64,...' string -> a ContentFile holding a fresh JPEG.

    Re-encoding keeps only the pixels: phone location (EXIF) and anything hidden in the file are dropped.
    """
    match = DATA_URL.fullmatch(str(data_url or '').strip())
    if not match:
        raise InvalidCoverPhoto('Upload a JPEG, PNG or WebP photo.')
    try:
        raw = base64.b64decode(match['data'], validate=False)
    except (binascii.Error, ValueError):
        raise InvalidCoverPhoto('The photo could not be read. Take it again.') from None
    return clean_image(raw)


def clean_image(raw):
    """Image bytes -> a ContentFile holding a fresh JPEG. Raises InvalidCoverPhoto."""
    if len(raw) > MAX_BYTES:
        raise InvalidCoverPhoto('The photo is too large (max 1.5 MB).')

    try:
        with Image.open(io.BytesIO(raw)) as probe:
            if probe.width * probe.height > MAX_PIXELS:
                raise InvalidCoverPhoto('The photo is too large.')
            probe.verify()  # structure check; the image must be opened again afterwards
        with Image.open(io.BytesIO(raw)) as image:
            image = ImageOps.exif_transpose(image)  # keep the orientation the phone recorded, then drop EXIF
            image = image.convert('RGB')
            image.thumbnail((LONG_SIDE, LONG_SIDE))
            out = io.BytesIO()
            image.save(out, format='JPEG', quality=85, optimize=True)
    except InvalidCoverPhoto:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise InvalidCoverPhoto('This file is not a valid photo.') from None

    return ContentFile(out.getvalue(), name=f'{uuid.uuid4().hex}.jpg')
