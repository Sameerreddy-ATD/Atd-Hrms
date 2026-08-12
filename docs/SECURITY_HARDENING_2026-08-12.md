# Security hardening — 12 Aug 2026

White-box findings from the audit were patched as follows (no live exploit run).

## High

| Finding | Fix |
| ------- | --- |
| Support password as org-wide master key | TTL 1–24h (default 4); legacy hash-only secrets rejected; support login forces password change + `sessionVersion` bump + audit/notification |
| Default JWT/encryption secrets | `assertSecureConfig` refuses defaults outside `test` unless `ALLOW_INSECURE_DEV_SECRETS=true`; encryption key no longer falls back to refresh JWT |
| Web Push SSRF | Allowlist push-provider hosts + block private DNS; validate on subscribe and before send |
| Handoff compose insecure | Documented; `ALLOW_INSECURE_DEV_SECRETS` required for local handoff only |

## Medium

| Finding | Fix |
| ------- | --- |
| Unauthenticated ID-card PII | Signed HMAC verification token (30d); rate-limited; company phone removed from public response |
| 8-char file ownership | Full userId prefix + `private_files` ownership table; managers only for linked team medical URLs |
| Attach another user’s vault URL | Ownership check on leave/expense attach |
| Refresh reuse | Login + refresh rotate `sessionVersion` |
| DA lockout gap | Lockout/suspension apply to Developer Admin; no auto-clear of suspension on DA login |
| Login enumeration | Generic error + dummy bcrypt for unknown users |
| Upload MIME trust | Magic-byte allowlist (PDF/JPEG/PNG/WebP) + `nosniff` + attachment disposition |
| Thumb CSV unbounded | Max 5,000 rows |

## Low

| Finding | Fix |
| ------- | --- |
| Password min 8 on change/reset | Raised to 10 |
| `failedLoginAttempts` in session DTO | Removed from `userDto` (kept on employee admin DTO) |
| JWT algorithms | Explicit `HS256` on sign/verify |
| Birthday age leak | Age only for HR / Main Admin / Developer Admin |
| Rate limits | Dedicated verify-id + upload limiters |

## Residual / deferred

- Dockerfile still runs as root (ops follow-up)
- General API rate limit remains high for shared office NAT (uploads/verify-id tightened)
- True admin **impersonation** (instead of shared support password) still preferred long-term
- Old medical/receipt files on disk without `private_files` rows: only accessible via full-userId prefix or privileged roles
