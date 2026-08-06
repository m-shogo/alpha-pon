# Stock Pro Council Persona Verdicts

This directory is reserved for local append-only PersonaVerdict JSONL files.
Real verdict records are ignored by Git and must not contain secrets, raw
licensed prices or brokerage credentials.

A PersonaVerdict must pass:

- `research/schemas/persona-verdict.schema.json`;
- persona ID/version/jurisdiction validation;
- `issuedAt >= informationCutoff`;
- evidence requirements for support, oppose and veto;
- persona-specific registered veto codes;
- abstention requirements;
- confidence calibration requirements;
- facts/assumptions/forecasts separation;
- duplicate `(runId, personaId)` rejection;
- one information cutoff per council run.

A verdict is not a brokerage order. Council integration remains blocked until
the Recommendation candidate, evidence firewall, replay manifest and portfolio
suitability contracts are implemented and validated.
