# Linux and AWS Deployment Guide

This guide covers a fresh Ubuntu 24.04 deployment for approximately 200-300 employees. The current AWS installation uses one EC2 instance, local MySQL, Nginx, and two PM2 processes.

For provider selection, deployment-model trade-offs, current INR estimates, and the recommended
low-cost architecture, read [Cloud Deployment Options and Costs](CLOUD_DEPLOYMENT_OPTIONS.md)
before purchasing infrastructure. New installations should use `main`. The existing production
server can continue tracking `version-1` until a deliberate branch switch is scheduled.

Commands use `hrms.example.com` as a placeholder. Replace it with the receiving company's approved
hostname everywhere, including DNS, `.env`, the frontend build, Nginx, TLS, and acceptance tests.

## Recommended Starting Capacity

| Resource | Minimum starting point                                          |
| -------- | --------------------------------------------------------------- |
| CPU      | 2 vCPU for light use; 4 vCPU preferred for builds and reporting |
| RAM      | 4 GB minimum; 8 GB preferred                                    |
| Storage  | 50-100 GB gp3/SSD with backups                                  |
| OS       | Ubuntu Server 24.04 LTS                                         |

A `t3.small` can run an early deployment but may use burst CPU during `npm ci` and builds. Monitor CPU credits, memory, disk, MySQL latency, and PM2 restarts.

## 1. Network and Security Group

Allow:

- TCP 22 from the administrator’s current public IP only
- TCP 80 from `0.0.0.0/0`
- TCP 443 from `0.0.0.0/0`

Do not expose MySQL `3306`, backend `4000`, or frontend `8081` publicly.

## 2. Install System Software

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git nginx mysql-server build-essential certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node -v
npm -v
```

## 3. Create MySQL Database

```bash
sudo systemctl enable --now mysql
sudo mysql
```

```sql
CREATE DATABASE anytimediesel_hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'atd_hrms'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON anytimediesel_hrms.* TO 'atd_hrms'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Store the actual password only in the server `.env` and the organization’s password manager.

## 4. Configure Private GitHub Access

Create the application directory:

```bash
sudo mkdir -p /opt/anytime-crew-hub
sudo chown ubuntu:ubuntu /opt/anytime-crew-hub
```

Generate a dedicated read-only deploy key:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "atd-hrms-production-deploy" \
  -f ~/.ssh/employee-management-deploy -N ""
cat ~/.ssh/employee-management-deploy.pub
```

In GitHub, open the private repository, then **Settings > Deploy keys > Add deploy key**. Add the public key with read-only access.

Configure an SSH alias:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-atd-ems
  HostName github.com
  User git
  IdentityFile ~/.ssh/employee-management-deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh-keyscan -H github.com >> ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts
```

Clone the canonical `main` branch for a new installation:

```bash
git clone --branch main \
  git@github-atd-ems:Sameerreddy-ATD/Employee-Management-System.git \
  /opt/anytime-crew-hub
cd /opt/anytime-crew-hub
```

## 5. Configure Production Environment

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Required shape:

```text
DATABASE_URL="mysql://atd_hrms:URL_ENCODED_PASSWORD@127.0.0.1:3306/anytimediesel_hrms"
BACKEND_PORT=4000
FRONTEND_ORIGIN="https://hrms.example.com"
VITE_API_BASE_URL="https://hrms.example.com/api"
VITE_ALLOWED_HOSTS="hrms.example.com"
VITE_API_TIMEOUT_MS=20000
TRUST_PROXY="loopback"
JWT_ACCESS_SECRET="LONG_RANDOM_SECRET"
JWT_REFRESH_SECRET="DIFFERENT_LONG_RANDOM_SECRET"
EMPLOYEE_DATA_ENCRYPTION_KEY="STABLE_32_PLUS_CHARACTER_EMPLOYEE_DATA_SECRET"
FACE_EVIDENCE_DIR="/var/lib/anytime-crew-hub/face-evidence"
SESSION_COOKIE_NAME="adh_session"
REFRESH_COOKIE_NAME="adh_refresh"
COOKIE_SECURE=true
NODE_ENV=production
VAPID_PUBLIC_KEY="PUBLIC_VAPID_KEY"
VAPID_PRIVATE_KEY="PRIVATE_VAPID_KEY"
VAPID_SUBJECT="mailto:responsible-company-email@anytimediesel.com"
```

Generate VAPID keys once with `npx web-push generate-vapid-keys`. Keep the private key secret. `VAPID_SUBJECT` is a responsible contact URI, not a generated email.

Generate JWT secrets with a secure password generator or `openssl rand -base64 48`.
Generate `EMPLOYEE_DATA_ENCRYPTION_KEY` once with `openssl rand -base64 48`, store it in a secret
manager, and keep it stable across deployments. Do not rotate it without re-encrypting existing
employee private fields.

Create the private persistent evidence directory before starting the backend:

```bash
sudo install -d -m 700 -o ubuntu -g ubuntu /var/lib/anytime-crew-hub/face-evidence
```

It must remain outside the Git checkout and Nginx document root. Face templates and evidence use
the same stable encryption key. Losing or changing the key makes them unreadable.

## 6. Install, Migrate, and Build

```bash
cd /opt/anytime-crew-hub
npm ci
npm run repo:audit
npx prisma generate
npm run db:deploy
npm run db:audit
npm run build
npm run build:backend
```

For a brand-new installation only:

```bash
SEED_PASSWORD='temporary-strong-initial-password' npm run db:seed
```

Do not seed an existing production database. Give the initial Developer Admin password through a
secure channel, require an immediate password change, and do not save `SEED_PASSWORD` in the
production `.env` after initialization.

## 7. Start PM2

```bash
pm2 start npm --name atd-backend -- run start:backend
pm2 start npm --name atd-frontend -- run start:frontend -- --host 0.0.0.0 --port 8081
pm2 save
pm2 startup systemd
```

Run the additional `sudo` command printed by `pm2 startup`.

## 8. Configure Nginx

Create `/etc/nginx/sites-available/anytime-ems`:

```nginx
server {
    listen 80;
    server_name hrms.example.com;
    client_max_body_size 20m;

    # Preserve the versioned integration path when proxying to Express. This
    # more-specific block must appear before the general /api/ block.
    location /api/v1/ {
        proxy_pass http://127.0.0.1:4000/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /api/v1 {
        proxy_pass http://127.0.0.1:4000/api/v1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Disabling buffering and extending `/api` read timeout are required for attendance and notification SSE streams.

```bash
sudo ln -s /etc/nginx/sites-available/anytime-ems /etc/nginx/sites-enabled/anytime-ems
sudo nginx -t
sudo systemctl reload nginx
```

## 9. DNS and HTTPS

Create an `A` record for the approved hostname pointing to the instance Elastic IP. An Elastic IP is recommended because an EC2 auto-assigned public IP changes after stop/start.

```bash
sudo certbot --nginx -d hrms.example.com
sudo certbot renew --dry-run
```

Rebuild the frontend whenever `VITE_API_BASE_URL` changes.

## 10. Verify

```bash
pm2 status
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:4000/health/db
curl -fsS http://127.0.0.1:4000/api/v1
curl -fsS https://hrms.example.com/api/v1
curl -I https://hrms.example.com
```

Test browser login, session restore, mobile location permission, attendance, live cross-device refresh, leave, announcements, Web Push, logout, account deactivation/reactivation, expense Drive acknowledgement, integration credential creation/revocation, and one authenticated Employee API request.

For the face-attendance release also verify:

1. an existing account is blocked by the registration gate;
2. Developer Admin opens the workspace without face authentication;
3. a normal employee submits and remains pending;
4. Developer Admin reviews retained evidence and approves the employee;
5. check-in requires camera, head-turn challenge, face match, and precise GPS; check-out requires
   precise GPS without camera access;
6. `npm run db:verify` and `npm run db:audit` report no face integrity failure; and
7. the backend service account can write `FACE_EVIDENCE_DIR` but Nginx cannot serve it directly.

The `/api/v1` metadata and OpenAPI endpoints do not expose secrets. Employee data endpoints still
require a scoped API key. See [Employee Data Model and Integration API](EMPLOYEE_DATA_AND_INTEGRATION_API.md).

## 11. Existing Deployment Repository Switch

Preserve environment and database before changing source:

```bash
cd /opt/anytime-crew-hub
cp -p .env /home/ubuntu/anytime-crew-hub.env.backup-$(date +%F_%H-%M)
chmod 600 /home/ubuntu/anytime-crew-hub.env.backup-*
git remote set-url origin git@github-atd-ems:Sameerreddy-ATD/Employee-Management-System.git
git fetch origin
git checkout version-1
git pull --ff-only origin version-1
```

The current production server has already completed this switch and may remain on `version-1`.
Because routine updates must use one consistent branch, do not change it to `main` during an
ordinary release. A planned switch requires a verified database backup, a clean worktree, and:

```bash
cd /opt/anytime-crew-hub
git fetch origin
git checkout main
git pull --ff-only origin main
```

## 12. Routine Update

Follow [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md). Never delete or overwrite `.env` during `git pull`; it is ignored and remains server-local.
