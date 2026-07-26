# Upgrade and Maintenance Guide

## Source of Truth

- Repository: `Sameerreddy-ATD/Employee-Management-System` (private)
- Canonical release branch: `main`
- Existing production checkout branch: `version-1`
- Server checkout: `/opt/anytime-crew-hub`
- Server remote: `git@github-atd-ems:Sameerreddy-ATD/Employee-Management-System.git`

Company AWS migration (RDS, S3, CI/CD): [AWS Deployment Patterns](AWS_DEPLOYMENT_PATTERNS.md).
Host and RDS install commands: [Linux and AWS Deployment](LINUX_LOCAL_DEPLOYMENT.md).

The production server uses a read-only GitHub deploy key. Do not copy a personal GitHub token into `.env` or the repository.

## Before Every Release

1. Confirm the local worktree is clean and `origin` is the new private repository.
2. Review migrations, permissions, data deletion, and environment changes.
3. Run:

```bash
npm ci
npx prisma validate
npm run repo:audit
npm run typecheck
npm run lint
npm test
npm run build
npm run build:backend
npm run audit:deps
```

4. Commit with the configured organization identity and push the canonical `main` release. Keep
   `version-1` release-compatible while the existing server still tracks it.
5. Record the previous production commit: `git rev-parse HEAD`.

## Production Backup

Create a restricted backup directory once:

```bash
sudo mkdir -p /var/backups/anytime-ems
sudo chown ubuntu:ubuntu /var/backups/anytime-ems
chmod 700 /var/backups/anytime-ems
```

Before a migration or high-risk release:

```bash
cd /opt/anytime-crew-hub
cp -p .env /home/ubuntu/anytime-crew-hub.env.backup-$(date +%F_%H-%M)
chmod 600 /home/ubuntu/anytime-crew-hub.env.backup-*
mysqldump --single-transaction --routines --triggers -u atd_hrms -p anytimediesel_hrms \
  > /var/backups/anytime-ems/before-update-$(date +%F_%H-%M).sql
```

## Standard Production Update

Before the first update containing employee private-data encryption, add a stable
`EMPLOYEE_DATA_ENCRYPTION_KEY` (32+ characters) to `/opt/anytime-crew-hub/.env` and include that
file in the encrypted configuration backup. Do this before any bank/PAN/Aadhaar/UAN value is saved.

Before migration `20260723180000_face_attendance`, also create a persistent private directory and add
it to `.env`:

```bash
sudo install -d -m 700 -o ubuntu -g ubuntu /var/lib/anytime-crew-hub/face-evidence
printf '%s\n' 'FACE_EVIDENCE_DIR="/var/lib/anytime-crew-hub/face-evidence"' >> .env
```

Do not add the variable twice. Review `.env` privately and correct duplicates before restarting.
The migration is additive, but the security behavior is intentionally disruptive: every existing
normal account is blocked until face registration is complete. Developer Admin is exempt from face
authentication and can immediately review all other registrations.

Run `npx prisma migrate deploy` before restarting the backend. Migration `20260721103000_add_employee_shifts` adds day/night shift configuration with day-shift defaults for existing employees.

### Workflow-integrity and session-revocation migration

Migration `20260725110000_security_and_workflow_integrity` is required before starting the updated
backend. It adds `users.session_version`, converts legacy HR-document delivery value `PHYSICAL` to
`PRINTED`, and replaces the delivery-mode check constraint. The data conversion is limited to that
legacy enum value; it does not delete requests.

After deployment, existing browser cookies do not carry a session version and must sign in again.
This is intentional. Password changes/resets, suspension, deactivation, sensitive account edits,
and logout then revoke older cookies immediately.

### Precise attendance-duration and open-session migration

Migration `20260725170000_precise_attendance_durations` increases attendance-hour precision and
rebuilds existing daily duration totals from the immutable punch ledger. It also flags historical
days whose latest punch is an unmatched check-in. The updated backend blocks a new attendance day
until that earlier session is resolved through a missed-punch correction, preventing overlapping
cross-day sessions. The migration does not invent checkout times or count an open interval as
worked time.

### Task Workspace v2 migration warning

Migration `20260722213000_task_workspace_v2` intentionally clears all legacy Task boards, stages,
assignments, updates, and tasks before installing the new versioned Work Planner storage model. It
does not remove any employee, user, attendance, leave, expense, HR-document, asset, department,
branch, integration, setting, or audit row. Create and retain a backup before deployment if legacy
Task history must be exported or restored later.

Migration `20260723100000_task_board_versioning` is non-destructive. It adds
`task_boards.version INT NOT NULL DEFAULT 1` and a positive-value check so concurrent board settings,
archive, and restore actions cannot silently overwrite one another. Deploy it before starting the
new backend.

### Leave-policy migration warning

Release migration `20260716190000_leave_policy_and_weekly_off` removes legacy leave requests, leave balances, and configurable leave types before installing Casual Leave, Sick Leave, Unpaid Leave / LOP, and Comp Off. Create and verify the MySQL dump above before deploying this release. Keep that dump when historical legacy leave records may be needed for payroll or compliance.

```bash
cd /opt/anytime-crew-hub
git status
git fetch origin
# Existing production currently tracks version-1. Use main only after a planned branch switch.
git pull --ff-only origin version-1
npm ci
npx prisma generate
npm run db:deploy
npm run build
npm run build:backend
npm run db:audit
pm2 restart atd-backend --update-env
pm2 restart atd-frontend --update-env
pm2 save
```

Do not use `git reset --hard`, `prisma migrate dev`, or `npm audit fix --force` in production.

## Moving From Testing To Real Data

Before using **System Settings > Production Data Reset**, create a non-empty MySQL backup and confirm that it contains table definitions. The reset is irreversible from the application. It preserves the signed-in Developer Admin credentials, branches, departments, hierarchy, predefined leave policies, and system settings; all other testing data is permanently removed. After the reset, keep the existing Developer Admin session open, verify the preserved setup, and create real logins from **User Logins**. Follow [Reset and Go-Live](RESET_AND_GO_LIVE.md) for the complete sequence.

## Employee Integration Releases

When a release changes employee master data or `/api/v1`:

1. Back up MySQL before `npm run db:deploy`.
2. Review `docs/openapi.employee-v1.yaml` for contract changes.
3. Run the employee/account mismatch SQL in `EMPLOYEE_DATA_AND_INTEGRATION_API.md`.
4. Verify `/api/v1`, `/api/v1/openapi.yaml`, scoped read/write access, idempotent replay,
   stale-version conflict, change-feed ordering, credential revocation, and retained history after
   deactivation.
5. Inform consuming application owners before any backward-incompatible new API version. Existing
   v1 fields must not be silently removed or repurposed.

## Post-Update Verification

```bash
pm2 status
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:4000/health/db
curl -I https://hrms.example.com
```

Then test login, dashboard restore, mobile attendance, cross-device timer refresh, leave submit/approval, announcement delivery, notification scope, user status, and logout.

For the face-attendance release, test camera and precise-location denial, enrollment retry, pending
approval, rejection reason, encrypted evidence history, retention settings, leave-confirmed
check-in, checkout, and one-time session expiry. Confirm the evidence directory is persistent across
a PM2 restart or container replacement.

For a Work Planner release, create a board and task, add/reorder a custom stage, change the task
stage, post an update, archive and restore the board, and confirm the stage/status/activity remain
synchronized. Run `npm run db:audit` again after the test.

For releases that change shared navigation or dashboards, also verify:

- CEO sidebar labels and read-only access to Workforce, Attendance Overview, Work Planner, Leave
  Overview, and Company Investment;
- Developer Admin, HR, head, and employee menus do not gain unauthorized entries;
- page headers and actions at 390 px, tablet width, and laptop width; and
- the document width does not overflow on mobile; primary lists use cards on phones and tables may
  scroll inside their section on larger screens;

## Rollback

Application-only rollback:

```bash
cd /opt/anytime-crew-hub
git checkout <previous-known-good-commit>
npm ci
npm run build
npm run build:backend
pm2 restart atd-backend --update-env
pm2 restart atd-frontend --update-env
```

Return to the branch after investigation:

```bash
# Use the branch assigned to this server. Existing production currently uses version-1.
git checkout version-1
git pull --ff-only origin version-1
```

Restore MySQL only if a migration or data operation is incompatible. Database restoration discards changes made after the dump, so define and approve the outage window first.

## Monitoring and Capacity

- Check `/health`, `/health/db`, PM2 restart counts, CPU, memory, disk, MySQL size, and Nginx errors.
- Rotate PM2 and Nginx logs.
- Keep at least daily encrypted MySQL backups and test restoration regularly.
- Renew TLS automatically and test with `sudo certbot renew --dry-run`.
- Review dependency audit findings; upgrade high-risk packages in a tested development release.
- The current single backend process supports in-memory SSE. Introduce Redis pub/sub before horizontal backend scaling.

## Ongoing Maintenance Cadence

Production is not “set and forget.” After go-live, use at least this schedule. Company AWS details
(RDS snapshots, S3 growth, CloudWatch) are also summarized in
[AWS Deployment Patterns § Post-Deploy Maintenance](AWS_DEPLOYMENT_PATTERNS.md#16-post-deploy-maintenance-on-aws).

| Cadence | Work |
| ------- | ---- |
| Daily | Confirm PM2/ECS healthy; hit `/health` and `/health/db`; skim error logs; watch disk (or S3) growth |
| Weekly | Confirm backups completed; review alarms; glance at dependency/security notices |
| Every release | Backup/snapshot → `db:deploy` → restart → smoke login, attendance, leave, checklists |
| Monthly | Apply OS security updates; review RDS storage and connections; rotate secrets if policy requires; prune old logs/backups; check TLS renewal |
| Quarterly | Restore a backup into a throwaway database; review IAM/security groups; revisit CPU/RAM/storage |

Named ownership must include one person who can restore the database and redeploy the last
known-good Git commit.

## CI/CD And Releases

Automated checks and gated deploys are recommended once the company AWS environment exists:

1. **CI on every PR / `main` push:** validate, typecheck, lint, test, build frontend and backend.
2. **CD to staging** from a green `main` SHA (or release tag).
3. **CD to production** only with GitHub Environment approval (or equivalent), after RDS
   snapshot/backup, using the same SHA that passed staging.

Illustrative workflow shapes and OIDC notes:
[AWS Deployment Patterns § GitHub Actions CI/CD](AWS_DEPLOYMENT_PATTERNS.md#15-github-actions-cicd-recommended-shape).

Until CD exists, continue the manual production update section above. Do not auto-apply production
migrations without a human gate.

## Versioning

Use annotated release tags after a verified production deployment:

```bash
git tag -a v1.1.0 -m "Anytime Diesel Employee Management System v1.1.0"
git push origin v1.1.0
```

Release notes must list migrations, new environment variables, permission changes, destructive behavior, deployment steps, validation results, and rollback limits.
