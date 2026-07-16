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

## Post-Update Verification

```bash
pm2 status
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:4000/health/db
curl -I https://hrms.sameerreddy.in
```

Then test login, dashboard restore, mobile attendance, cross-device timer refresh, leave submit/approval, announcement delivery, notification scope, user status, and logout.

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
