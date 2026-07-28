# Cloud Deployment Options and Cost Guide

This guide explains the supported hosting models for Anytime Workforce, compares
representative providers in Indian rupees, and defines the recommended low-cost production
architecture. It complements the command-level
[Linux and AWS Deployment Guide](LINUX_LOCAL_DEPLOYMENT.md) and the
[Upgrade and Maintenance Guide](UPGRADE_AND_MAINTENANCE.md).

Pricing changes frequently. The figures below were reviewed on **23 July 2026**, are rounded, and
must be confirmed in the provider's calculator before purchase. Foreign prices use approximately
`₹96.57/USD` and `₹110.17/EUR`, derived from the European Central Bank reference rates for
22 July 2026. Unless the provider explicitly includes Indian tax, the table shows pre-tax cost and
a separate estimate if 18% GST applies. Card foreign-exchange fees, backup storage, excess transfer,
support plans, and domain renewal can add to the total.

## 1. Application Hosting Requirements

The current application requires:

- an always-running Node.js 22 frontend process;
- an always-running Node.js 22 Express backend;
- MySQL 8 with durable storage and transactional backups;
- Nginx or an equivalent reverse proxy;
- long-lived Server-Sent Events connections for live attendance and notifications;
- HTTPS, secure HTTP-only cookies, and a stable public hostname;
- at least 2 GB RAM for a small early deployment;
- 4 GB RAM for a comfortable production starting point;
- 8 GB RAM when builds run on the production server or reporting usage grows; and
- 50 GB or more SSD/NVMe storage with independent backups.

The immediate production target is approximately **150 active employees**, with headroom toward
200-300. This does not require Kubernetes or a multi-server cluster. A single properly secured VPS
is sufficient, provided that the database is backed up to a different failure domain. See
[§1.1 Capacity for ~150 employees](#11-capacity-for-150-employees) for the minimum VPS and storage
plan sized for that workforce without lag.

## 1.1 Capacity for ~150 employees

Use this section when sizing or upgrading the VPS for Anytime Diesel (or a similar company) with
about **150 employees** using the app daily for attendance, leave, tasks, and HR workflows.

### What drives load

| Load | Why it matters |
| --- | --- |
| Morning check-in burst | Many employees open the PWA and punch within the same 15–30 minutes (face verify + GPS + MySQL writes + live SSE). This is the peak that must stay snappy. |
| Concurrent browsing | Managers/HR open dashboards, day logs, and reports while punches continue. |
| MySQL on the same host | Attendance summaries, events, leave, and tasks share RAM with Node. Under-sized RAM causes swap and lag. |
| On-server builds | `npm ci` / `NODE_ENV=production npm run build` need temporary CPU and RAM; prefer building off-box or upgrading before running builds during office hours. |
| Face evidence files | Registration stores encrypted centre/left/right photos (not daily punch photos). Retention defaults to a few days and must live on durable disk. |

Face matching models (~11 MB) are served as static files and run in the employee’s browser; they do
not require a GPU on the VPS.

### Minimum VPS (no lag for ~150)

| Resource | Absolute minimum | Recommended for ~150 (no lag) | Prefer when doing on-server builds / growth to 200–300 |
| --- | ---: | ---: | ---: |
| **vCPU** | 2 | **2–4** | **4** |
| **RAM** | 4 GB | **8 GB** | **8–16 GB** |
| **Disk (SSD/NVMe)** | 50 GB | **80–100 GB** | **100–150 GB** |
| **Swap** | 1–2 GB safety net | 2 GB | 2–4 GB (never a substitute for RAM) |
| **OS** | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| **MySQL** | Same host OK | Same host OK | Separate RDS/managed MySQL when reports or uptime targets grow |

**Do not run ~150 employees on 2 GB RAM.** A 2 vCPU / 2 GB host (for example the current early
`t3.small`-class box) can demo the product, but concurrent morning punches plus MySQL will push it
into swap and feel laggy. Treat **4 GB as the floor** and **8 GB as the comfortable production
shape** for this workforce.

Representative shapes that match the recommendation:

| Shape | Notes |
| --- | --- |
| **2 vCPU / 8 GB / 80–100 GB SSD** | Best single-VPS starting point for ~150 employees |
| AWS Lightsail 2 vCPU / 4 GB or DigitalOcean 2 vCPU / 4 GB | Acceptable **minimum** if you cannot take 8 GB yet; monitor memory and morning latency |
| AWS EC2 `t3.medium` (2 vCPU / 4 GB) or `t3.large` (2 vCPU / 8 GB) | Prefer `t3.large` / `t4g.large` for Mumbai; watch burstable CPU credits or use fixed-performance if punches stall |
| Hostinger KVM 2 (2 vCPU / 8 GB) | Cost-effective commercial VPS when India latency and policy allow |

### Storage plan (~150 employees)

Plan disk as **usable SSD**, not “marketing GB after OS.” Keep **independent backups off the same
disk** (object storage or another region).

| Component | Approx. first-year size | Notes |
| --- | ---: | --- |
| Ubuntu + packages + logs (rotated) | 8–15 GB | Enable `logrotate`; prune PM2 / Nginx logs |
| App tree (`/opt/anytime-crew-hub`, `node_modules`, builds) | 1.5–3 GB | Face models under `public/face-models` are ~11 MB |
| MySQL data (attendance, leave, tasks, assets, audit) | 2–8 GB | ~150 people, daily punches, and audit history stay modest for years if indexes stay healthy |
| Face evidence (`FACE_EVIDENCE_DIR`) | 0.5–3 GB | Three registration photos per person; retention (default days, not years) keeps this bounded |
| Local dump scratch (temporary) | 2–5 GB | For `mysqldump` before copy-off; delete after upload |
| Free headroom | ≥20% of disk | Required so MySQL and builds do not fill the volume |

**Practical recommendation:** start at **80–100 GB SSD**. Alert when disk use exceeds **70%**. Do
not rely on the early 20 GB root volume for full workforce go-live.

### Network and concurrency assumptions

- Public ports: **80/443 only**; MySQL `3306`, backend `4000`, and frontend `8081` stay private.
- Expect brief peaks of tens of concurrent API requests during check-in, not hundreds of sustained
  WebSocket servers.
- Long-lived SSE connections scale with open dashboards; 8 GB RAM leaves room for Node + MySQL
  buffer pool without thrashing.
- Prefer an **India region** (for example AWS Mumbai / DigitalOcean Bangalore) so mobile GPS and
  face-check round-trips stay low.

### Upgrade triggers (before users feel lag)

Upgrade CPU/RAM/disk (or move MySQL off-box) when any of these appear:

- Available RAM regularly under ~500 MB or swap used during office hours
- API `/health` or check-in p95 latency climbing under the morning burst
- MySQL slow-query log showing lock waits on attendance writes
- Disk above 70% used
- PM2 restart loops or OOM kills on `atd-backend` / `atd-frontend`
- On-server production builds starving the live app

### Current early production note

The existing public host has historically been a **2 vCPU / ~2 GB RAM / ~20 GB disk** class machine.
That is fine for limited UAT. Before ~150 employees punch every day, resize to at least the
**minimum** row above, preferably the **recommended** 2–4 vCPU / 8 GB / 80–100 GB shape, and confirm
off-box MySQL backups.

### Recommended capacity stages

| Stage | CPU | RAM | Storage | Comment |
| --- | ---: | ---: | ---: | --- |
| Test/demo | 1–2 shared vCPU | 2 GB | 25–40 GB | Not for irreplaceable employee data |
| **~150 employees — minimum** | **2 vCPU** | **4 GB** | **50 GB** | Floor for go-live without chronic lag |
| **~150 employees — recommended** | **2–4 vCPU** | **8 GB** | **80–100 GB** | Comfortable punches, reports, MySQL cache |
| Growth toward 200–300 / heavy reports | 4 vCPU | 8–16 GB | 100–150 GB | Consider managed MySQL (RDS) |
| Separated data tier | 2–4 vCPU app | 4–8 GB app | App 40 GB+; DB separate | VPS/EC2 app + RDS MySQL |

## 2. Recommended Low-Cost Architecture

```text
Internet
   |
Cloudflare DNS/proxy (optional free layer)
   |
HTTPS :443
   |
Nginx
   |-- /        -> frontend on 127.0.0.1:8081
   |-- /api/*   -> backend on 127.0.0.1:4000
                         |
                         -> MySQL on 127.0.0.1:3306

Daily encrypted MySQL dump -> separate object storage/provider
Weekly provider snapshot   -> server recovery
```

Only ports 80 and 443 are public. SSH port 22 is restricted to administrator IP addresses.
MySQL, the backend, and the frontend preview port must never be exposed directly to the internet.

For ~150 employees, size the single VPS using [§1.1](#11-capacity-for-150-employees)
(**prefer 2–4 vCPU / 8 GB / 80–100 GB SSD**).

## 3. Provider Cost Comparison in INR

| Provider/configuration                            |     Approx. pre-tax monthly cost | Approx. with 18% tax | Suitability                                                      |
| ------------------------------------------------- | -------------------------------: | -------------------: | ---------------------------------------------------------------- |
| Oracle Always Free ARM, up to 2 OCPU/12 GB        |                               ₹0 |                   ₹0 | Demo or non-critical use; no SLA and capacity can be unavailable |
| Hostinger KVM 1, 1 vCPU/4 GB                      |   ₹599 promotional; ₹999 renewal |         ₹707; ₹1,179 | Cheapest commercial entry; CPU is limited                        |
| Hostinger KVM 2, 2 vCPU/8 GB                      | ₹779 promotional; ₹1,199 renewal |         ₹919; ₹1,415 | Best advertised low-cost capacity; promotional term applies      |
| Hetzner CX23 EU, 2 vCPU/4 GB plus IPv4            |                       About ₹660 |           About ₹779 | Excellent flexible price; European latency/data location         |
| AWS Lightsail, 2 vCPU/2 GB                        |                     About ₹1,160 |         About ₹1,369 | Simple AWS option; RAM is tight                                  |
| DigitalOcean Basic, 1 vCPU/2 GB                   |                     About ₹1,160 |         About ₹1,369 | Simple but below preferred production capacity                   |
| DigitalOcean Basic, 2 vCPU/4 GB                   |                     About ₹2,318 |         About ₹2,736 | Good predictable VPS; prefer a nearby region                     |
| AWS Lightsail, 2 vCPU/4 GB                        |                     About ₹2,318 |         About ₹2,736 | Best simple AWS starting shape                                   |
| Existing AWS EC2 `t3.small`, ~20–50 GB gp3, IPv4  |                     About ₹2,200 |         About ₹2,600 | Early UAT only; **2 GB RAM is below the ~150-employee floor**     |
| Railway application plus MySQL                    |              About ₹2,400-₹3,900 |        ₹2,830-₹4,600 | Convenient but usage-based and storage-limited on Hobby          |
| Fly.io application plus external MySQL            |                    About ₹3,000+ |              ₹3,540+ | More components and no cost advantage                            |
| Managed application plus production managed MySQL |                  ₹8,000-₹12,000+ |      ₹9,400-₹14,200+ | Lower operations burden, substantially higher cost               |
| Managed Kubernetes                                |                         ₹10,000+ |             ₹11,800+ | Not justified for the current scale                              |

### Pricing references

- [ECB euro reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/html/index.hr.html)
- [Hostinger India VPS pricing](https://www.hostinger.com/in/vps-hosting)
- [Hetzner June 2026 cloud price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
- [Hetzner public IPv4 pricing](https://docs.hetzner.com/cloud/servers/overview/)
- [AWS Lightsail bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html)
- [AWS EC2 On-Demand pricing](https://aws.amazon.com/ec2/pricing/on-demand/)
- [AWS EBS pricing](https://aws.amazon.com/ebs/pricing/)
- [AWS public IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
- [DigitalOcean Droplet pricing](https://www.digitalocean.com/pricing/droplets)
- [Railway resource pricing](https://docs.railway.com/pricing/plans)
- [Fly.io resource pricing](https://fly.io/docs/about/pricing/)
- [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Aiven MySQL pricing](https://aiven.io/pricing?product=mysql)

Promotional hosting prices commonly require an upfront multi-year purchase and renew at a higher
rate. Compare the full contract cost, not only the first advertised monthly figure. Confirm that
the selected plan permits the required data-center location before paying.

## 4. Deployment Method Comparison

### 4.1 Self-managed VPS

Examples: Hostinger VPS, Hetzner Cloud, DigitalOcean Droplet, AWS Lightsail, EC2, Google Compute
Engine, Azure Virtual Machines, and Oracle Compute.

**Advantages**

- lowest production cost;
- supports the application without a database-engine change;
- complete control over Node.js, MySQL, Nginx, PM2, firewall, and backups;
- easy vertical resizing; and
- predictable billing on fixed bundles.

**Responsibilities**

- Ubuntu and MySQL patching;
- firewall, SSH, TLS, monitoring, backups, and restore testing;
- disk and memory monitoring; and
- incident recovery.

This is the recommended model for the current application.

### 4.2 Platform as a Service

Examples: Railway, Render, Fly.io, and similar application platforms.

**Advantages**

- Git-connected builds and deployments;
- managed logs, environment variables, health checks, and rollbacks; and
- less operating-system administration.

**Limitations for this application**

- always-on RAM for both the application and MySQL can cost more than a VPS;
- persistent volumes may be small or separately billed;
- Render provides managed PostgreSQL rather than managed MySQL;
- an external MySQL service adds cost and another network dependency; and
- SSE and long-running processes must be supported by the selected plan.

PaaS is appropriate when reduced administration is worth a higher monthly bill.

### 4.3 VPS application plus managed MySQL

The application remains on an inexpensive VPS while MySQL moves to RDS, Aiven, DigitalOcean
Managed MySQL, or another supported managed database.

**Advantages**

- automated database backups and patching;
- easier point-in-time recovery;
- database monitoring and resizing; and
- the application server can be replaced without moving database files.

**Trade-offs**

- production-grade managed MySQL often costs more than the application server;
- cross-provider database traffic can add latency and transfer fees; and
- the database must remain private or tightly allow-listed.

Use the same provider and region for the VPS and managed database wherever possible.

### 4.4 Fully managed application and database

This model offers the lowest day-to-day infrastructure effort and the highest recurring cost.
It is suitable when the organization requires formal uptime commitments, point-in-time recovery,
support response targets, private networking, or compliance evidence.

### 4.5 Serverless functions

Static assets could be placed on a CDN, but the current backend is not a good direct fit for
short-lived functions because it uses Express, secure sessions, MySQL connections, and long-lived
SSE connections. Moving to a serverless platform would require architecture changes and would not
automatically reduce cost.

### 4.6 Containers and Kubernetes

Docker Compose on one VPS is possible and costs the same as the VPS. It can improve reproducibility,
but it is optional because the documented PM2 deployment already works.

Kubernetes, EKS, GKE, and AKS introduce control-plane, load-balancer, networking, monitoring, and
operational complexity. They are unnecessary until multiple replicas, automated failover, and
independent service scaling are genuine requirements.

### 4.7 Shared web hosting

Conventional PHP/shared hosting is unsupported. It normally cannot provide always-running Node.js
processes, PM2, Prisma migrations, SSE, private MySQL administration, or the required deployment
control.

## 5. Decision Matrix

| Priority                          | Recommended choice         | Reason                                                                      |
| --------------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| Absolute zero-cost test           | Oracle Always Free         | No compute charge, but no production SLA                                    |
| Lowest advertised production cost | Hostinger KVM 2            | 2 vCPU/8 GB at low promotional and renewal pricing                          |
| Lowest flexible foreign VPS cost  | Hetzner CX23               | Low month-to-month price without a long commitment                          |
| Low latency for Indian users      | India-region VPS/VM        | Prefer DigitalOcean Bangalore, AWS Mumbai, or another verified India region |
| Lowest migration risk             | Keep existing AWS EC2      | Current application, domain, Nginx, MySQL, and PM2 already work             |
| Simple AWS billing                | AWS Lightsail 4 GB         | Compute, disk, IPv4, and transfer are bundled                               |
| Lowest administration effort      | PaaS plus managed database | More automation at a higher recurring price                                 |
| Higher database resilience        | VPS plus managed MySQL     | Separates application failure from database storage                         |

### Project recommendation

1. **Current testing / early production:** keep the existing VPS or EC2 deployment until a tested
   company AWS replacement is ready.
2. **When the company moves this app onto AWS with existing RDS (and later S3):** follow the
   phased path in [AWS Deployment Patterns § Company AWS Migration Path](AWS_DEPLOYMENT_PATTERNS.md#0-company-aws-migration-path-vps-test--production) —
   dedicated MySQL database on RDS (do not merge into a legacy ~190-table schema), EC2 app tier
   first, S3 after a storage adapter, CI/CD with production approval gates.
3. **If reducing cost is the primary goal outside company AWS:** evaluate Hostinger KVM 2 in a
   suitable nearby region.
4. **If month-to-month flexibility is more important than latency:** evaluate Hetzner CX23.
5. **If staying inside AWS without a large platform team:** Lightsail 4 GB or right-sized EC2 + RDS.
6. **Do not use free hosting for the only copy of employee, banking, PAN, Aadhaar, or UAN data.**

The engineering time and downtime risk of migration can cost more than a small monthly saving.
Run the new environment in parallel, restore a recent backup, complete acceptance testing, and
switch DNS only after verification. Host install commands:
[Linux and AWS Deployment](LINUX_LOCAL_DEPLOYMENT.md). Release and maintenance cadence:
[Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md).

## 6. Estimated Complete Monthly Budget

For a low-cost single-VPS deployment:

| Item                                 |                         Expected cost |
| ------------------------------------ | ------------------------------------: |
| 2 vCPU/8 GB promotional VPS          |                                  ₹779 |
| Estimated GST                        |                                  ₹140 |
| Independent encrypted backup storage |                             ₹100-₹250 |
| Let's Encrypt TLS                    |                                    ₹0 |
| Cloudflare free DNS/proxy            |                                    ₹0 |
| Existing domain                      |                 Existing renewal cost |
| **Expected promotional total**       | **Approximately ₹1,000-₹1,200/month** |

At the Hostinger KVM 2 advertised renewal price, budget approximately ₹1,500-₹1,700 per month
including estimated tax and independent backup storage.

Never treat a provider snapshot as the only database backup. A billing dispute, account lock,
operator mistake, or provider outage can affect the server and its snapshots together.

## 7. Provider Selection Checklist

Before purchasing:

1. Confirm the exact data-center city and expected latency from employee locations.
2. Confirm promotional duration, upfront commitment, renewal price, GST, and card FX fees.
3. Confirm public IPv4, SSD/NVMe size, included bandwidth, snapshot pricing, and restore procedure.
4. Confirm Ubuntu 24.04, root access, firewall controls, and API/console access.
5. Confirm whether automated backups are application-consistent or only disk snapshots.
6. Confirm the provider's availability commitment and support channel.
7. Confirm the organization's policy for storing employee identity and banking data outside India.
8. Set a monthly billing alert before creating resources.

## 8. Secure Production Checklist

- [ ] Use Ubuntu 24.04 LTS and install security updates.
- [ ] Allow SSH only from named administrator IP addresses.
- [ ] Disable password-based root login after key access is verified.
- [ ] Expose only ports 80 and 443 publicly.
- [ ] Keep MySQL on `127.0.0.1` or a private network.
- [ ] Use a strong unique MySQL password.
- [ ] Preserve stable JWT, VAPID, and employee-data encryption secrets.
- [ ] Store `EMPLOYEE_DATA_ENCRYPTION_KEY` in a separate secure backup.
- [ ] Use HTTPS and verify certificate renewal.
- [ ] Configure daily encrypted MySQL dumps to another provider/account.
- [ ] Keep at least 14-30 daily database backups.
- [ ] Test a restore at least monthly.
- [ ] Monitor uptime, CPU, memory, disk, MySQL reachability, PM2 restarts, and backup completion.
- [ ] Run `npm run db:verify` and `npm run db:audit` after every release.

The employee-data encryption key is not replaceable by a database backup. If the database is
restored without the original key, encrypted bank account, PAN, Aadhaar, and UAN values cannot be
read.

## 9. Migration From the Existing AWS Server

Do not terminate the existing EC2 instance until the replacement has run successfully and a
rollback window has passed.

1. Create and secure the new VPS using the Linux deployment guide.
2. Install the same Node.js and MySQL major versions.
3. Back up the existing `.env` and MySQL database.
4. Copy the database dump over an encrypted channel.
5. Copy production secrets without committing them to Git.
6. Restore MySQL on the new private database.
7. Pull `main` or the current `version-1` deployment branch.
8. Run migrations, database verification, audit, builds, and health checks.
9. Test login, profile, ID card, attendance, leave, expenses, HR documents, tasks, notifications,
   integrations, and mobile layouts using a temporary hostname.
10. Reduce DNS TTL, update the DNS record, and monitor both environments.
11. Keep the old EC2 instance stopped but recoverable during the agreed rollback period.
12. After approval, retain required backups and then remove chargeable AWS resources deliberately.

The exact installation, Nginx, PM2, environment, TLS, verification, and update commands are in
[Linux and AWS Deployment](LINUX_LOCAL_DEPLOYMENT.md). The backup and release procedure is in
[Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md).

## 10. Branch and Release Policy

- `main` is the canonical source branch for new installations and releases.
- `version-1` remains available for the existing production checkout and must contain the same
  released application changes until that server is deliberately switched to `main`.
- A server must track one branch consistently. Do not alternate branches during routine updates.
- Never force-push either production branch.
- Database migrations must be deployed before the backend process is restarted.
