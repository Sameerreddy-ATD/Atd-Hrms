# Linux Local Deployment Guide

This guide explains how to deploy the Anytime Diesel Employee Management System on a local Linux computer or server for approximately 200-300 users.

The recommended local production setup is:

- Ubuntu Server 22.04 or 24.04 LTS
- Node.js 22 LTS
- MySQL 8.0
- Nginx reverse proxy
- PM2 process manager
- LAN access from office computers and mobiles

Use this guide in two ways:

- **Local LAN deployment**: users open the app with the server IP, for example `http://192.168.1.50`.
- **Domain deployment**: users open the app with your domain, for example `https://hrms.anytimediesel.com`.

## 1. Recommended Machine Size

For 200-300 users, start with:

| Resource | Recommended                          |
| -------- | ------------------------------------ |
| CPU      | 4 cores minimum, 6-8 cores preferred |
| RAM      | 8 GB minimum, 16 GB preferred        |
| Storage  | 100 GB SSD minimum                   |
| Network  | Wired LAN preferred                  |
| OS       | Ubuntu Server 22.04 LTS or 24.04 LTS |

Biometric/eSSL sync is planned for the next version. When that integration is added and many device punches sync at the same time, prefer 16 GB RAM and SSD storage.

## 2. Install System Packages

Login to the Linux machine, then run:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git nginx ufw build-essential
```

## 3. Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

Expected Node version should start with `v22`.

## 4. Install MySQL Server

```bash
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo systemctl start mysql
sudo systemctl status mysql
```

Secure MySQL:

```bash
sudo mysql_secure_installation
```

Choose a strong MySQL root password and keep it safely.

## 5. Create Database And User

Open MySQL:

```bash
sudo mysql
```

Run this SQL. Replace `CHANGE_THIS_STRONG_PASSWORD` with a real password:

```sql
CREATE DATABASE anytimediesel_hrms
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'atd_hrms'@'localhost' IDENTIFIED BY 'CHANGE_THIS_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON anytimediesel_hrms.* TO 'atd_hrms'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 6. Download The Project

Choose a deployment folder:

```bash
sudo mkdir -p /opt/anytime-crew-hub
sudo chown -R $USER:$USER /opt/anytime-crew-hub
cd /opt
git clone https://github.com/sameerreddy213/anytime-crew-hub.git
cd /opt/anytime-crew-hub
```

If the folder already exists:

```bash
cd /opt/anytime-crew-hub
git pull origin main
```

## 7. Create Production Environment File

```bash
cp .env.example .env
nano .env
```

Use values like this for IP/LAN deployment:

```text
DATABASE_URL="mysql://atd_hrms:CHANGE_THIS_STRONG_PASSWORD@127.0.0.1:3306/anytimediesel_hrms"
BACKEND_PORT=4000
FRONTEND_ORIGIN="http://YOUR_SERVER_IP"
JWT_ACCESS_SECRET="make-this-a-long-random-secret"
JWT_REFRESH_SECRET="make-this-a-different-long-random-secret"
SESSION_COOKIE_NAME="adh_session"
REFRESH_COOKIE_NAME="adh_refresh"
COOKIE_SECURE=false
NODE_ENV=production
```

For local LAN HTTP deployment, keep `COOKIE_SECURE=false`.

For domain + HTTPS deployment, use values like this:

```text
DATABASE_URL="mysql://atd_hrms:CHANGE_THIS_STRONG_PASSWORD@127.0.0.1:3306/anytimediesel_hrms"
BACKEND_PORT=4000
FRONTEND_ORIGIN="https://hrms.your-domain.com"
VITE_API_BASE_URL="https://hrms.your-domain.com/api"
JWT_ACCESS_SECRET="make-this-a-long-random-secret"
JWT_REFRESH_SECRET="make-this-a-different-long-random-secret"
SESSION_COOKIE_NAME="adh_session"
REFRESH_COOKIE_NAME="adh_refresh"
COOKIE_SECURE=true
NODE_ENV=production
```

## 8. Install Project Dependencies

```bash
npm ci
```

If `npm ci` fails because `package-lock.json` is out of date, run:

```bash
npm install
```

## 9. Prepare The Database

Apply Prisma migrations:

```bash
npm run db:deploy
```

Seed baseline data only for first setup or demo setup:

```bash
npm run db:seed
```

Verify database connection:

```bash
npm run db:verify
```

Expected output should show user and employee counts.

## 10. Build The Application

```bash
npm run typecheck
npm run build
npm run build:backend
```

## 11. Test Run Before Service Setup

Start backend:

```bash
npm run start:backend
```

Open another terminal and start frontend preview:

```bash
npm run start:frontend -- --port 8081
```

Test from the Linux machine:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/health/db
```

Open from another computer on the same LAN:

```text
http://YOUR_SERVER_IP:8081
```

Stop the test commands with `Ctrl+C` before continuing.

## 12. Install PM2

PM2 keeps the backend and frontend running after restart.

```bash
sudo npm install -g pm2
```

Start backend and frontend:

```bash
cd /opt/anytime-crew-hub
pm2 start npm --name atd-hrms-backend -- run start:backend
pm2 start npm --name atd-hrms-frontend -- run start:frontend -- --port 8081
pm2 save
pm2 startup systemd
```

The `pm2 startup systemd` command prints one more command. Copy and run that command with `sudo`.

Check status:

```bash
pm2 status
pm2 logs atd-hrms-backend
pm2 logs atd-hrms-frontend
```

## 13. Configure Nginx For IP/LAN Access

Create a site config:

```bash
sudo nano /etc/nginx/sites-available/anytime-hrms
```

Paste this config. Replace `YOUR_SERVER_IP` with the Linux machine IP address.

```nginx
server {
    listen 80;
    server_name YOUR_SERVER_IP;

    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /health/db {
        proxy_pass http://127.0.0.1:4000/health/db;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
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

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/anytime-hrms /etc/nginx/sites-enabled/anytime-hrms
sudo nginx -t
sudo systemctl reload nginx
```

Now open:

```text
http://YOUR_SERVER_IP
```

## 14. Connect Your Domain

Use this when you want users to open the Employee Management System using a domain like:

```text
https://hrms.anytimediesel.com
```

### Step 1: Point DNS To The Server

In your domain provider or DNS panel, create an `A` record:

| Type | Name   | Value                 |
| ---- | ------ | --------------------- |
| `A`  | `hrms` | Your public server IP |

Example:

```text
hrms.anytimediesel.com -> 203.0.113.10
```

If the Linux server is inside the office and does not have a public IP, you have two options:

- Use local LAN only, for example `http://192.168.1.50`.
- Ask your internet provider/router admin to set a static public IP and port forwarding to the Linux server.

Do not expose MySQL. Only web traffic should be opened to the internet.

### Step 2: Update `.env`

Edit:

```bash
cd /opt/anytime-crew-hub
nano .env
```

Set:

```text
FRONTEND_ORIGIN="https://hrms.your-domain.com"
VITE_API_BASE_URL="https://hrms.your-domain.com/api"
COOKIE_SECURE=true
NODE_ENV=production
```

### Step 3: Update Nginx For Domain

Edit:

```bash
sudo nano /etc/nginx/sites-available/anytime-hrms
```

Use this config. Replace `hrms.your-domain.com` with your real domain.

```nginx
server {
    listen 80;
    server_name hrms.your-domain.com;

    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /health/db {
        proxy_pass http://127.0.0.1:4000/health/db;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
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

Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Step 4: Rebuild Frontend After Domain Change

The frontend reads `VITE_API_BASE_URL` during build, so rebuild after changing `.env`:

```bash
cd /opt/anytime-crew-hub
npm run build
pm2 restart atd-hrms-frontend
pm2 restart atd-hrms-backend
```

## 15. Add HTTPS SSL Certificate

Install Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Request SSL certificate:

```bash
sudo certbot --nginx -d hrms.your-domain.com
```

Choose the option to redirect HTTP to HTTPS when Certbot asks.

Check auto-renewal:

```bash
sudo certbot renew --dry-run
```

After HTTPS is working, confirm `.env` has:

```text
FRONTEND_ORIGIN="https://hrms.your-domain.com"
VITE_API_BASE_URL="https://hrms.your-domain.com/api"
COOKIE_SECURE=true
```

Then rebuild and restart:

```bash
npm run build
pm2 restart all
```

## 16. Firewall

For LAN/IP deployment, allow SSH and web traffic:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
sudo ufw status
```

For domain + HTTPS deployment, also allow HTTPS:

```bash
sudo ufw allow 443/tcp
sudo ufw status
```

If you are testing without Nginx, temporarily allow port `8081`:

```bash
sudo ufw allow 8081/tcp
```

After Nginx is working, direct frontend port access is not needed.

## 17. Frontend API URL

For Nginx deployment, set frontend API base URL before building:

```text
VITE_API_BASE_URL="http://YOUR_SERVER_IP/api"
```

For domain + HTTPS deployment:

```text
VITE_API_BASE_URL="https://hrms.your-domain.com/api"
```

Add it to `.env`, then rebuild:

```bash
npm run build
pm2 restart atd-hrms-frontend
```

Without Nginx, the frontend can talk directly to:

```text
VITE_API_BASE_URL="http://YOUR_SERVER_IP:4000"
```

## 18. Update Deployment To A New Version

Use this every time a new version is pushed to GitHub.

### Safe Update Checklist

1. Inform users about short downtime.
2. Backup MySQL.
3. Pull latest code.
4. Install dependencies.
5. Apply database migrations.
6. Build frontend and backend.
7. Restart PM2.
8. Test login and key pages.

### Step 1: Backup Before Updating

```bash
mysqldump -u atd_hrms -p anytimediesel_hrms > /var/backups/anytime-hrms/before_update_$(date +%F_%H-%M).sql
```

### Step 2: Pull Latest Code

```bash
cd /opt/anytime-crew-hub
git fetch origin
git status
git pull origin main
```

### Step 3: Install, Migrate, Build, Restart

```bash
npm ci
npm run db:deploy
npm run typecheck
npm run build
npm run build:backend
pm2 restart atd-hrms-backend
pm2 restart atd-hrms-frontend
```

### Step 4: Verify After Update

```bash
pm2 status
curl http://localhost:4000/health
curl http://localhost:4000/health/db
```

Then open the app and check:

- Login
- Dashboard
- Employee list
- Leave apply
- Attendance page
- Notifications

## 19. Version Tagging

When you want to mark a stable deployment version, tag it in Git:

```bash
git tag -a v1.0.0 -m "Anytime Diesel Employee Management System v1.0.0"
git push origin v1.0.0
```

For the next version:

```bash
git tag -a v1.1.0 -m "Anytime Diesel Employee Management System v1.1.0"
git push origin v1.1.0
```

Use simple version meaning:

- `v1.0.0` - first stable local deployment
- `v1.1.0` - new feature release
- `v1.1.1` - small fix release

## 20. Roll Back To Previous Version

Use rollback only if the latest update has a serious issue.

### Roll Back Code

List recent commits:

```bash
git log --oneline -10
```

Go back to a known good tag or commit:

```bash
git checkout v1.0.0
npm ci
npm run db:deploy
npm run build
npm run build:backend
pm2 restart all
```

Important: database migrations are not always reversible. If a database migration caused the problem, restore the backup taken before update:

```bash
mysql -u atd_hrms -p anytimediesel_hrms < /var/backups/anytime-hrms/before_update_YYYY-MM-DD_HH-MM.sql
```

After rollback, test login and important pages again.

## 21. Backup MySQL Daily

Create backup folder:

```bash
sudo mkdir -p /var/backups/anytime-hrms
sudo chown -R $USER:$USER /var/backups/anytime-hrms
```

Manual backup:

```bash
mysqldump -u atd_hrms -p anytimediesel_hrms > /var/backups/anytime-hrms/anytimediesel_hrms_$(date +%F).sql
```

Add a daily cron backup:

```bash
crontab -e
```

Add:

```cron
0 2 * * * mysqldump -u atd_hrms -p'CHANGE_THIS_STRONG_PASSWORD' anytimediesel_hrms > /var/backups/anytime-hrms/anytimediesel_hrms_$(date +\%F).sql
```

Important: if you put the password in cron, keep server access restricted.

## 22. Performance Notes For 200-300 Users

Use these settings as a practical starting point.

### MySQL

Edit:

```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

Suggested values for 8-16 GB RAM:

```ini
[mysqld]
max_connections = 300
innodb_buffer_pool_size = 2G
innodb_log_file_size = 512M
slow_query_log = 1
long_query_time = 2
```

Restart MySQL:

```bash
sudo systemctl restart mysql
```

For 8 GB RAM, `innodb_buffer_pool_size = 1G` is also fine.

### Node/PM2

For 200-300 users, one backend process may be enough for local office usage. If many users use it at the same time, run backend in cluster mode:

```bash
pm2 delete atd-hrms-backend
pm2 start dist-server/server/src/index.js --name atd-hrms-backend -i 2
pm2 save
```

Use `-i 4` only if the server has enough CPU cores.

## 23. Security Checklist

- Use strong MySQL password.
- Use strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
- Do not expose MySQL port `3306` to the network.
- Keep only ports `80` and `22` open unless HTTPS is configured.
- Use HTTPS if users access by domain or from outside the office LAN.
- Keep MySQL bound to localhost where possible.
- Keep `.env` private.
- Run regular MySQL backups.
- Create Linux user accounts only for trusted admins.

## 24. Common Problems

### Login works on server but not other computers

Check:

- `FRONTEND_ORIGIN` matches the URL users open.
- `VITE_API_BASE_URL` points to the backend or Nginx `/api`.
- Nginx config is reloaded.
- Firewall allows port `80`.

### Domain opens but login fails

Check:

- DNS points to the correct server IP.
- Nginx `server_name` matches the domain.
- `.env` has the exact domain in `FRONTEND_ORIGIN`.
- `.env` has the exact API URL in `VITE_API_BASE_URL`.
- Frontend was rebuilt after changing `.env`.
- For HTTPS, `COOKIE_SECURE=true`.

### SSL certificate fails

Check:

```bash
sudo nginx -t
sudo ufw status
dig hrms.your-domain.com
```

The domain must point to the server public IP before Certbot can issue a certificate.

### Database connection fails

Check:

```bash
sudo systemctl status mysql
npm run db:verify
```

Confirm `DATABASE_URL` username, password, host, port, and database name.

### App is slow

Check:

```bash
pm2 status
top
free -h
df -h
```

If RAM is low, increase server memory. If CPU is high, use PM2 cluster mode.

### After pulling new code, app behaves old

Run:

```bash
npm run build
npm run build:backend
pm2 restart all
```
