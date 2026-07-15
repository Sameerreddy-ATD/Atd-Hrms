# Upgrade And Maintenance Guide

Use this procedure for every future release. Never update production without a database backup and a known Git revision.

## Before Development

1. Create a feature branch from the current stable branch.
2. Record the current deployed commit with `git rev-parse HEAD`.
3. Add a Prisma migration for every database schema change. Never edit an already deployed migration.
4. Update the workflow, technical, user, deployment, and compatibility documentation when behavior changes.

## Required Validation

Run on the development machine:

```bash
npm ci
npx prisma validate
npm run typecheck
npm run lint
npm test
npm run build
npm run build:backend
```

Review lint warnings, dependency audit results, migration SQL, and `git diff` before merging.

## Production Update On Ubuntu

```bash
cd /opt/anytime-crew-hub
git fetch --all --tags
git status
git rev-parse HEAD
mkdir -p /var/backups/anytime-ems
mysqldump -u atd_hrms -p anytimediesel_hrms > /var/backups/anytime-ems/before_update_$(date +%F_%H-%M).sql
git pull --ff-only origin version-1
npm ci
npx prisma generate
npm run db:deploy
npm run build
npm run build:backend
sudo systemctl restart anytime-crew-backend
sudo systemctl reload nginx
```

Use the actual service name if it differs. Do not run `prisma migrate dev` on production.

## Post-Update Checks

```bash
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:4000/health/db
curl -I https://hrms.sameerreddy.in
sudo systemctl status anytime-crew-backend --no-pager
sudo journalctl -u anytime-crew-backend -n 100 --no-pager
```

Then complete the operational checklist in [OPERATIONS_AND_WORKFLOWS.md](OPERATIONS_AND_WORKFLOWS.md) on iPhone, Android, tablet, and desktop.

## Versioning

Use semantic versions:

- Patch `1.0.1`: bug fixes without workflow changes.
- Minor `1.1.0`: backward-compatible features or screens.
- Major `2.0.0`: breaking workflow, API, or migration changes.

```bash
git tag -a v1.1.0 -m "Anytime Diesel Employee Management System v1.1.0"
git push origin v1.1.0
```

Maintain release notes containing database migrations, changed permissions, new environment variables, affected workflows, and rollback constraints.

## Rollback

1. Stop user traffic if data compatibility is uncertain.
2. Check out the previously recorded commit or release tag.
3. Run `npm ci`, regenerate Prisma, and rebuild both applications.
4. Restart the backend and reload Nginx.
5. Restore the pre-update MySQL backup only when the migration changed data incompatibly.

Database migrations are not automatically reversible. Restoring a backup discards production changes made after that backup, so confirm the rollback window first.

## Future Feature Procedure

For Wi-Fi validation, photo verification, biometric device sync, paid/unpaid leave, or external task integrations:

1. Write the permission and data-retention rules first.
2. Add schema and migration changes.
3. implement backend validation and RBAC before exposing frontend controls.
4. Add loading, error, empty, offline, permission-denied, and retry states.
5. Test cross-source attendance, hierarchy visibility, concurrent use, and mobile browsers.
6. Update all relevant documents and release notes.
