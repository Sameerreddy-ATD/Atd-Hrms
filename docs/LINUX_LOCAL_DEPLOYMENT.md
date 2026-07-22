# Linux and AWS Deployment Guide

This guide covers a fresh Ubuntu 24.04 deployment for approximately 200-300 employees. The current AWS installation uses one EC2 instance, local MySQL, Nginx, and two PM2 processes.

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

Clone `version-1`:

```bash
git clone --branch version-1 \
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
FRONTEND_ORIGIN="https://hrms.sameerreddy.in"
VITE_API_BASE_URL="https://hrms.sameerreddy.in/api"
JWT_ACCESS_SECRET="LONG_RANDOM_SECRET"
JWT_REFRESH_SECRET="DIFFERENT_LONG_RANDOM_SECRET"
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

## 6. Install, Migrate, and Build

```bash
cd /opt/anytime-crew-hub
npm ci
npx prisma generate
npm run db:deploy
npm run build
npm run build:backend
```

For a brand-new installation only:

```bash
npm run db:seed
```

Do not seed an existing production database.

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
    server_name hrms.sameerreddy.in;
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

Create an `A` record for `hrms` pointing to the instance Elastic IP. An Elastic IP is recommended because an EC2 auto-assigned public IP changes after stop/start.

```bash
sudo certbot --nginx -d hrms.sameerreddy.in
sudo certbot renew --dry-run
```

Rebuild the frontend whenever `VITE_API_BASE_URL` changes.

## 10. Verify

```bash
pm2 status
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:4000/health/db
curl -fsS http://127.0.0.1:4000/api/v1
curl -fsS https://hrms.sameerreddy.in/api/v1
curl -I https://hrms.sameerreddy.in
```

Test browser login, session restore, mobile location permission, attendance, live cross-device refresh, leave, announcements, Web Push, logout, account deactivation/reactivation, expense Drive acknowledgement, integration credential creation/revocation, and one authenticated Employee API request.

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

The current production server has already completed this switch.

## 12. Routine Update

Follow [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md). Never delete or overwrite `.env` during `git pull`; it is ignored and remains server-local.
