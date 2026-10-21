import json
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from integrations.metadata.exceptions import ProviderError

USER_AGENT = 'BookHero/1.0 (inventory ISBN lookup)'  # Open Library asks clients to identify themselves


def get_json(url, params, timeout):
    """GET url?params and return the parsed JSON. Any failure raises ProviderError."""
    request = Request(f'{url}?{urlencode(params)}', headers={'Accept': 'application/json', 'User-Agent': USER_AGENT})
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed https URLs only
            return json.loads(response.read().decode('utf-8'))
    except (URLError, TimeoutError, OSError, ValueError) as error:  # HTTPError is a URLError; ValueError covers bad JSON
        raise ProviderError(str(error)) from error
