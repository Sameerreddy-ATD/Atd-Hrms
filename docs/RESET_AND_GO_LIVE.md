# Reset Testing Data and Go Live

This runbook explains how to remove demonstration/testing records and prepare the application for
real company use. The reset is intentionally destructive and cannot be reversed from the UI.

## 1. What the Reset Preserves

- The Developer Admin account that performs the reset, including its current password.
- The Developer Admin's linked employee record, if one exists.
- Branches and their attendance coordinates/radii.
- Departments, unit types, sort order, and parent/child hierarchy.
- Predefined leave-policy types and their configured rules.
- System settings, startup-screen values, and role/module-access configuration.
- Developer Admin remains exempt from face authentication, preventing an approval-authority
  lockout after reset.

Department-head and employee-manager assignments are cleared because their testing employees may
be removed.

## 2. What the Reset Permanently Deletes

- Every other login and employee.
- Attendance events, summaries, corrections, reminders, schedules, and field attendance.
- Leave balances, requests, weekly-off requests, and compensatory-off credits.
- Tasks, boards, assignments, stages, and task updates.
- Expenses, advances, and HR document requests.
- Assets, assignments, returns, and catalog records.
- Holidays, biometric devices and mappings, announcements, push subscriptions, and notifications.
- Employee API credentials, idempotency records, change events, profile requests, emergency
  contacts, and audit history.
- Other users' face profiles, sessions, metadata, and encrypted evidence files.

## 3. Required Pre-Reset Checks

1. Schedule a maintenance window and stop users from entering new information.
2. Confirm that you are signed in as the Developer Admin account that must remain.
3. Confirm that the current branches, departments, hierarchy, leave policies, startup values, and
   module-access rules are suitable for production.
4. Create a timestamped MySQL backup outside the application server's repository.
5. Verify that the backup is non-empty and record its SHA-256 checksum.
6. Copy `/opt/anytime-crew-hub/.env` to a mode-`600` backup without printing its contents.
7. Verify `/api/health`, `/api/health/db`, PM2 status, and the current Git commit.

Example server-side database backup:

```bash
sudo install -d -m 700 -o ubuntu -g ubuntu /var/backups/anytime-ems
mysqldump --single-transaction --routines --triggers --events --no-tablespaces \
  -u atd_hrms -p anytimediesel_hrms \
  > /var/backups/anytime-ems/before-production-reset-$(date +%F_%H-%M-%S).sql
chmod 600 /var/backups/anytime-ems/before-production-reset-*.sql
```

## 4. Perform the Reset

1. Open **System Settings** as Developer Admin.
2. Scroll to **Production Data Reset**.
3. Select **Delete all testing data**.
4. Type `DELETE ALL TEST DATA` exactly.
5. Enter the current Developer Admin password.
6. Select **Permanently delete testing data** once.
7. Wait for the success message. Do not refresh or submit the action again while it is running.

The backend runs the deletion as one database transaction. A database error rolls back the whole
reset rather than leaving a partially cleared system.

Developers can validate this workflow against a disposable local database with the guarded
`npm run test:data-reset` command documented in `scripts/README.md`. The command refuses remote
database hosts and database names that do not contain `reset_validation`.

## 5. Verify Immediately After Reset

Keep the existing browser session open and verify:

1. **User Logins** contains only the preserved Developer Admin.
2. **Employees** is empty, unless the Developer Admin has a linked employee record.
3. **Branches** still contains the intended production branches and coordinates.
4. **Departments** retains the complete hierarchy and has no testing department heads.
5. **Leave Policies** still lists all predefined policy types and their configured rules.
6. Tasks, expenses, attendance, assets, holidays, announcements, devices, and audit logs contain no
   testing records.
7. **System Settings > Module Access** still contains the intended role permissions.
8. Backend, database, frontend, and Nginx remain healthy.

Server verification:

```bash
cd /opt/anytime-crew-hub
npm run db:verify
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:4000/health/db
curl -fsS https://hrms.example.com/api/health
pm2 status
```

## 6. Configure the Real Organization

Complete these steps in order so references and permissions are correct:

1. Review **Branches** and add or correct production addresses, coordinates, radius, city, code, and
   active status.
2. Review **Departments** and create the final reporting hierarchy. Leave department heads empty
   until their real employee records exist.
3. Review **Leave Policies**, holidays, weekly-off rules, and attendance expectations.
4. Review **System Settings > Module Access** for every role.
5. Open **User Logins** and create leadership/HR accounts first, then managers and employees. Each
   login creates or links the canonical employee record.
6. Ask each new user to change the temporary password and complete face registration. Review
   submissions under **Face Security**; approve only after confirming the intended employee.
7. Return to **Departments** and assign real department heads.
8. Edit employee profiles to set employer company, personal/company contact, manager, department,
   attendance location, designation, joining date, banking/statutory fields, and employment
   type, attendance mode, and employee code.
9. Add biometric devices, then map device user IDs to the correct employee records.
10. Configure holidays, announcements, asset catalog/assignments, and task boards.
11. If another application needs employee data, create a scoped credential under **Employee API
    Access** and store the displayed secret in that application's secret manager.

## 7. Acceptance Test Before Staff Sign In

Use one non-privileged test account representing a real employee and verify:

1. First-login password change, mandatory normal-account face registration, Developer Admin
   exemption and approval, and subsequent sign-in.
2. Mobile sidebar, profile, and module visibility match the assigned role.
3. Camera/precise-location denial, glasses-friendly live head-turn challenge, fast face-matched
   check-in, another-face alerting, location-only check-out, and branch-radius behavior.
4. Leave application and approval using a preserved leave policy.
5. Task assignment, task opening on mobile, stage change, and daily work update.
6. Advance expense and expense submission, including the Google Drive sharing confirmation.
7. HR/CEO visibility and review actions for expenses and HR documents.
8. Notification delivery and logout.

Deactivate this acceptance-test account after verification. Do not run Production Data Reset again
after real employee or operational data has been entered.

## 8. Recovery

If verification fails before real data is entered, stop application writes, retain the failed-state
database for diagnosis, and restore the verified pre-reset backup. Do not repeatedly press the reset
button or run manual table deletions. Follow the database restore and application restart procedure
in [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md).
