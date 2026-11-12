import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from integrations.metadata.exceptions import ProviderError

USER_AGENT = 'BookHero/1.0 (inventory ISBN lookup)'  # Open Library asks clients to identify themselves
MAX_IMAGE_BYTES = 5_000_000


def get_json(url, params, timeout):
    """GET url?params and return the parsed JSON. Any failure raises ProviderError."""
    request = Request(f'{url}?{urlencode(params)}', headers={'Accept': 'application/json', 'User-Agent': USER_AGENT})
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed https URLs only
            return json.loads(response.read().decode('utf-8'))
    except (URLError, TimeoutError, OSError, ValueError) as error:  # HTTPError is a URLError; ValueError covers bad JSON
        raise ProviderError(str(error)) from error


def get_image(url, timeout):
    """GET an image (following redirects) -> its bytes, or None on a 404. Any other failure raises ProviderError."""
    request = Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 - https provider URLs only, see covers.py
            raw = response.read(MAX_IMAGE_BYTES + 1)
    except HTTPError as error:
        if error.code == 404:
            return None
        raise ProviderError(str(error)) from error
    except (URLError, TimeoutError, OSError) as error:
        raise ProviderError(str(error)) from error
    if len(raw) > MAX_IMAGE_BYTES:
        raise ProviderError('The image is too large.')
    return raw
