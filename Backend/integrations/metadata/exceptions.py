class ProviderError(Exception):
    """One provider could not answer (timeout, network error, HTTP error, bad JSON)."""


class MetadataNotFound(Exception):
    """No provider has a record for this ISBN."""


class MetadataUnavailable(Exception):
    """No record could be fetched because a provider failed: retrying later may work."""
