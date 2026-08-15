# Audit Logs

Clear guide to administrative audit history in Anytime Workforce: who can see it, what is
recorded, how to read the screen, and how to clear logs safely.

**Screen:** `/audit` (sidebar **Audit Logs**)  
**Roles:** Main Admin and Developer Admin only  
**Build:** `2026-08-15-audit-clear` and later

---

## What Audit Logs Are

Audit logs are an append-style history of important security and admin actions. Each row stores:

| Field | Meaning |
| --- | --- |
| When | India-local timestamp when the action was saved |
| Action | What happened (shown in plain English on the screen) |
| Actor | Who did it (or **System** if there is no user) |
| Role | Actor’s role at the time |
| Target | Affected person or object when known |
| Change | Optional before/after details (secrets redacted) |
| IP | Request IP when available |

Sensitive keys such as password, token, secret, and hash never appear as readable values; they are
stored as `[protected]`.

---

## Who Can Access

| Role | View list and summary | Clear all logs |
| --- | --- | --- |
| Developer Admin | Yes | Yes |
| Main Admin | Yes | Yes |
| HR, CEO, Manager, Employee, and others | No | No |

The API enforces the same rules. The menu item is not shown to other roles.

---

## How To Use The Screen

1. Sign in as Main Admin or Developer Admin.
2. Open **Audit Logs**.
3. Review the summary cards:
   - **Saved records** — total rows in the database
   - **Oldest saved** / **Latest saved** — time range of stored history
4. Use **Refresh** to reload the latest rows.
5. Filter with category chips: **All**, **Sign-in**, **People**, **Leave**, **Attendance**,
   **Security**, **System**.
6. Search by actor, action, role, target, or IP.
7. Expand **View change details** for before/after fields when present.

The list loads the latest records (up to 250 by default, maximum 1000 via API `limit`). The footer
shows how many of the loaded rows match your filters.

---

## Clear Audit Logs

Use this only when you intentionally want an empty history (for example after a controlled test
period, before a legal retention cutover, or when directed by leadership). Clearing is permanent.

### Steps

1. Open **Audit Logs**.
2. Select **Clear audit logs**.
3. Read the warning. The dialog shows how many records will be removed.
4. Type `CLEAR` exactly (case-sensitive).
5. Confirm.

### What happens on the server

1. `DELETE /audit-logs` with body `{ "confirmation": "CLEAR" }` runs.
2. All rows in `audit_logs` are deleted.
3. One new row is written: action `AUDIT_LOGS_CLEARED`, with `deletedCount` in the change details,
   actor = the admin who cleared, and their IP when available.

If the table was already empty, the API still succeeds and still writes the clear event.

### What clear does **not** do

- It does not delete attendance, leave, users, face evidence, or any other business tables.
- It does not replace the full **Production Data Reset** in System Settings (that reset is broader
  and Developer Admin–only, with a different confirmation phrase).
- It cannot be undone. Take a MySQL backup first if you may need the old history.

---

## API Reference

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/audit-logs` | Main Admin, Developer Admin | List recent logs (`limit` / `offset` supported) |
| `GET` | `/audit-logs/summary` | Main Admin, Developer Admin | Count, oldest, latest timestamps |
| `DELETE` | `/audit-logs` | Main Admin, Developer Admin | Clear all logs; body must be `{ "confirmation": "CLEAR" }` |

List response fields: `id`, `actor`, `role`, `action`, `target`, `timestamp`, `ipAddress`,
`oldValue`, `newValue`. When no affected user is linked, `target` may fall back to name, title,
email, or employee code from the saved change payload.

---

## What Gets Written (Examples)

Actions are recorded throughout the app. Examples include:

- Sign-in success / failure, password reset requests, admin password resets
- User create/update, suspend, offboard, reactivate
- Face enrollment submit / approve / reject / reset and face policy changes
- Lifecycle / People Changes apply steps
- Announcement deactivate and permanent delete
- Module-access matrix updates
- **Audit logs cleared** (`AUDIT_LOGS_CLEARED`) after a successful clear

Raw action strings may be `SCREAMING_SNAKE` or short English phrases; the UI always shows a
readable label.

---

## Code Map

| Concern | Location |
| --- | --- |
| Write helper | `server/src/audit.ts` |
| List / summary / clear routes | `server/src/app.ts` (`/audit-logs*`) |
| Table | Prisma model `AuditLog` → `audit_logs` |
| UI | `src/routes/_app.audit.tsx` |
| Client API | `auditApi` in `src/services/api/index.ts` |

---

## Related Documents

- Permissions matrix: [User Guide](USER_GUIDE.md)
- Retention and security rules: [Operations and Workflows](OPERATIONS_AND_WORKFLOWS.md)
- API groups: [Technical Overview](TECHNICAL_OVERVIEW.md)
- Full test-data wipe: [Reset and Go-Live](RESET_AND_GO_LIVE.md)
- Security posture: [Workflow and Security Audit](WORKFLOW_AND_SECURITY_AUDIT.md)
