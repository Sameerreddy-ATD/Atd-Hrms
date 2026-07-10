# Linux Local Deployment Guide

This guide explains how to deploy Anytime Diesel HRMS on a local Linux computer or server for approximately 200-300 users.

The recommended local production setup is:

- Ubuntu Server 22.04 or 24.04 LTS
- Node.js 22 LTS
- MySQL 8.0
- Nginx reverse proxy
- PM2 process manager
- LAN access from office computers and mobiles

## 1. Recommended Machine Size

For 200-300 users, start with:

| Resource | Recommended                          |
| -------- | ------------------------------------ |
| CPU      | 4 cores minimum, 6-8 cores preferred |
| RAM      | 8 GB minimum, 16 GB preferred        |
| Storage  | 100 GB SSD minimum                   |
| Network  | Wired LAN preferred                  |
| OS       | Ubuntu Server 22.04 LTS or 24.04 LTS |

If biometric devices sync many attendance punches at the same time, prefer 16 GB RAM and SSD storage.

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

Use values like this:

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

If you later add HTTPS, change:

```text
COOKIE_SECURE=true
FRONTEND_ORIGIN="https://your-domain-or-server-name"
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

## 13. Configure Nginx

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

## 14. Firewall

Allow SSH and web traffic:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
sudo ufw status
```

If you are testing without Nginx, temporarily allow port `8081`:

```bash
sudo ufw allow 8081/tcp
```

After Nginx is working, direct frontend port access is not needed.

## 15. Frontend API URL

For Nginx deployment, set frontend API base URL before building:

```text
VITE_API_BASE_URL="http://YOUR_SERVER_IP/api"
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

## 16. Update Deployment Later

When new code is pushed:

```bash
cd /opt/anytime-crew-hub
git pull origin main
npm ci
npm run db:deploy
npm run typecheck
npm run build
npm run build:backend
pm2 restart atd-hrms-backend
pm2 restart atd-hrms-frontend
```

## 17. Backup MySQL Daily

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

## 18. Performance Notes For 200-300 Users

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

## 19. Security Checklist

- Use strong MySQL password.
- Use strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
- Do not expose MySQL port `3306` to the network.
- Keep only ports `80` and `22` open unless HTTPS is configured.
- Use HTTPS if users access from outside the office LAN.
- Keep `.env` private.
- Run regular MySQL backups.
- Create Linux user accounts only for trusted admins.

## 20. Common Problems

### Login works on server but not other computers

Check:

- `FRONTEND_ORIGIN` matches the URL users open.
- `VITE_API_BASE_URL` points to the backend or Nginx `/api`.
- Nginx config is reloaded.
- Firewall allows port `80`.

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
