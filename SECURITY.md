# Security Policy

## Reporting a Vulnerability

Do not place credentials, employee information, screenshots containing personal data, exploit
details, or suspected vulnerabilities in a public issue. Report them privately to the repository
administrators and the authorized Anytime Diesel technical owner through an approved internal
channel. Include the affected route or component, impact, reproduction steps, and suggested
containment without including real employee records.

## Supported Release

Security fixes are maintained on canonical `main` and kept release-compatible with the existing
server's `version-1` checkout until that server is deliberately switched. A release is supported
only after its migrations, backend, and frontend have been deployed together and post-deployment
verification has passed.

## Required Practices

- Store passwords and integration credentials only as hashes.
- Keep JWT secrets, database credentials, VAPID private keys, SSH keys, dumps, and `.env` outside Git.
- Use HTTPS with secure HTTP-only cookies in production.
- Enforce authorization in the backend even when the frontend hides an action.
- Use scoped, revocable API credentials for integrations; never reuse browser sessions.
- Preserve audit and operational history when accounts are deactivated.
- Back up and audit MySQL before migrations or destructive resets.
- Keep `FACE_EVIDENCE_DIR` outside the web root with backend-only permissions. Face templates and
  evidence are sensitive biometric data and must never be committed, logged, emailed, or exposed
  through Employee API v1.
- Keep `EMPLOYEE_DATA_ENCRYPTION_KEY` stable and separately recoverable; it protects employee
  statutory fields, face templates, and evidence files.
- Treat browser-computed self-hosted liveness and device GPS as risk-reduction controls, not
  hardware-backed identity proofing. Review the documented threat boundary before regulated use.
- Run `npm run audit:deps`, `npm run db:audit`, and `npm run repo:audit` before releases.
- Use an exact trusted proxy hop count/subnet; production must not use `TRUST_PROXY=true`.
- Preserve the employee-data encryption key in a separately controlled recovery backup.

If a secret is exposed, revoke or rotate it immediately, inspect audit and access logs, remove it
from all deployment environments, and assess Git history rather than relying only on deleting the
current file.
