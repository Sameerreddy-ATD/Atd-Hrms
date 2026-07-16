# Database Scripts

This project runs on **MySQL 8.0**. The Express backend and Prisma client both read `DATABASE_URL` from `.env`.

## `start-mysql.ps1`

Starts the project-local MySQL server on `127.0.0.1:3306` using `.mysql-data-clean/`.

```bash
npm run db:start-mysql
```

Use this when the Windows `MySQL80` service is not running. The script is a no-op if MySQL is already listening.

## `verify-mysql.mjs`

Checks that Prisma can connect to MySQL and reports basic table counts.

```bash
npm run db:verify
```

## `migrate-postgres-to-mysql.ps1`

One-time legacy utility for copying data from an old PostgreSQL database into MySQL.

Requirements:

- PostgreSQL source still available on `127.0.0.1:5432`
- Empty MySQL target tables created by `npm run db:deploy`
- `psql` and `mysql` client binaries installed

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/migrate-postgres-to-mysql.ps1
```

This script is not part of normal development after the MySQL cutover.

## Script Safety

- Run scripts from the repository root.
- Back up production before migration or bulk data operations.
- Never place passwords directly in scripts or commit generated SQL/database files.
- Production uses `npm run db:deploy`; `npm run db:migrate` is development-only.
