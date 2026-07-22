# Upgrade and Maintenance Guide

## Source of Truth

- Repository: `Sameerreddy-ATD/Employee-Management-System` (private)
- Production branch: `version-1`
- Server checkout: `/opt/anytime-crew-hub`
- Server remote: `git@github-atd-ems:Sameerreddy-ATD/Employee-Management-System.git`

The production server uses a read-only GitHub deploy key. Do not copy a personal GitHub token into `.env` or the repository.

## Before Every Release

1. Confirm the local worktree is clean and `origin` is the new private repository.
2. Review migrations, permissions, data deletion, and environment changes.
3. Run:

```bash
npm ci
npx prisma validate
npm run typecheck
npm run lint
npm test
npm run build
npm run build:backend
```

4. Commit with the configured organization identity and push `version-1`.
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

Run `npx prisma migrate deploy` before restarting the backend. Migration `20260721103000_add_employee_shifts` adds day/night shift configuration with day-shift defaults for existing employees.

### Leave-policy migration warning

Release migration `20260716190000_leave_policy_and_weekly_off` removes legacy leave requests, leave balances, and configurable leave types before installing Casual Leave, Sick Leave, Unpaid Leave / LOP, and Comp Off. Create and verify the MySQL dump above before deploying this release. Keep that dump when historical legacy leave records may be needed for payroll or compliance.

```bash
cd /opt/anytime-crew-hub
git status
git fetch origin
git pull --ff-only origin version-1
npm ci
npx prisma generate
npm run db:deploy
npm run build
npm run build:backend
pm2 restart atd-backend --update-env
pm2 restart atd-frontend --update-env
pm2 save
```

Do not use `git reset --hard`, `prisma migrate dev`, or `npm audit fix --force` in production.

## Moving From Testing To Real Data

Before using **System Settings > Production Data Reset**, create a non-empty MySQL backup and confirm that it contains table definitions. The reset is irreversible from the application. It preserves the signed-in Developer Admin credentials, branches, departments, hierarchy, and system settings; all other testing data is permanently removed. After the reset, keep the existing Developer Admin session open, verify the preserved setup, and create real logins from **User Logins**.

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
curl -I https://hrms.sameerreddy.in
```

Then test login, dashboard restore, mobile attendance, cross-device timer refresh, leave submit/approval, announcement delivery, notification scope, user status, and logout.

For releases that change shared navigation or dashboards, also verify:

- CEO sidebar labels and read-only access to Workforce, Attendance Overview, Work Progress, Leave
  Overview, and Company Investment;
- Developer Admin, HR, head, and employee menus do not gain unauthorized entries;
- page headers and actions at 390 px, tablet width, and laptop width; and
- the document width does not overflow on mobile; wide tables must scroll inside their section.

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

## Versioning

Use annotated release tags after a verified production deployment:

```bash
git tag -a v1.1.0 -m "Anytime Diesel Employee Management System v1.1.0"
git push origin v1.1.0
```

Release notes must list migrations, new environment variables, permission changes, destructive behavior, deployment steps, validation results, and rollback limits.
