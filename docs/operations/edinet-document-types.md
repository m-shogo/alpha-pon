# EDINET document type-code boundary

Status: `REFERENCE_ONLY`

The EDINET document acquisition client accepts the API type-code strings `1` through `5` because the official API exposes document retrieval through a numeric `type` parameter.

Alpha Pon intentionally does not hard-code human-readable meanings for those codes in the downloader. The current official EDINET API specification must be checked when selecting a type for a real acquisition.

This prevents an outdated label from silently causing the wrong payload to be stored or treated as Evidence.

Rules:

- type code must be selected explicitly for each acquisition;
- the selected code is preserved in the local metadata manifest;
- content type and content disposition are recorded from the response;
- the downloaded bytes are content-hashed before use;
- a payload is not Evidence merely because download succeeded;
- no type-code assumption may authorize Recommendation, BUY or order behavior.
