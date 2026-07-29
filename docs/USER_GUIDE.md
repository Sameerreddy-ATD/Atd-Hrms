# Anytime Workforce User Guide

This guide explains how Developer Admin, HR, organization heads, employees, field staff, and leadership use Anytime Workforce.

## Who Can Do What

| Area                           | Developer Admin                                                | Main Admin              | HR                      | CEO                   | Manager                     | Employee / Sales / Driver / Field Staff |
| ------------------------------ | -------------------------------------------------------------- | ----------------------- | ----------------------- | --------------------- | --------------------------- | --------------------------------------- |
| Dashboard                      | Full system view                                               | Admin view              | HR operations view      | Summary/report view   | Team view                   | Personal view                           |
| User logins                    | Create, edit, suspend, deactivate, reactivate, reset passwords | No                      | No                      | No                    | No                          | No                                      |
| Employees                      | Full access                                                    | Full access             | Full access             | Summary/report access | Assigned team only          | Own profile only                        |
| Departments                    | Add, edit, delete, assign department heads                     | Reference access        | Reference access        | Reference access      | Reference access            | No                                      |
| Branches                       | Add, edit, deactivate                                          | Add, edit, deactivate   | Add, edit, deactivate   | View reports          | View assigned/team data     | No                                      |
| Biometric devices and mappings | Inventory only (live sync after office install)                | Inventory only          | Inventory only          | No                    | No                          | No                                      |
| Attendance                     | Full operational access                                        | Full operational access | Full operational access | Reports and summaries | Assigned team only          | Own attendance only                     |
| Leave policy and types         | View protected types; adjust credits                           | As configured           | View; adjust credits    | View reports          | Approve assigned team leave | Apply and track own leave               |
| Holidays                       | Add, edit, delete                                              | Add, edit, delete       | Add, edit, delete       | View                  | View                        | View                                    |
| Audit logs                     | View                                                           | View                    | No                      | No                    | No                          | No                                      |
| Asset management               | Full access                                                    | No                      | Full access             | Read-only investment  | No                          | No                                      |
| Expenses and HR documents      | Review all                                                     | No                      | Review all              | View all              | Own requests                | Own requests                            |
| Operations reports             | Full                                                           | Full                    | Full                    | Full                  | Team summary                | No                                      |
| Checklists                     | Templates add/edit/delete; can run instances                   | No                      | Run onboarding/offboarding instances | No                    | No                          | No                                      |
| System settings                | Full access                                                    | As configured           | No                      | No                    | No                          | No                                      |

## CEO Workspace

The CEO workspace is a read-only company overview. CEO accounts do not mark attendance and are
excluded from automatic absence settlement. CEO can open **Employee Services** to view expense and
HR-document queues (review actions remain with HR / Developer Admin).

The dashboard shows:

- total workforce, employees present, employees on leave, pending leave decisions, attendance
  exceptions, and employees whose attendance is not settled;
- organization-wide task delivery totals for active, overdue, review, and completed work;
- the number of employees with assigned assets, monthly recurring investment, and estimated
  first-year investment;
- branch attendance coverage, detailed employee attendance, and upcoming birthdays; and
- a downloadable attendance summary.

Use the executive navigation shortcuts or sidebar:

- **Workforce** opens organization-wide employee information.
- **Attendance Overview** opens date, employee, branch, source, and movement details.
- **Work Planner** opens organization-wide tasks, owners, due dates, and activity.
- **Leave Overview** opens leave status and approval progress.
- **Company Investment** opens read-only physical and online asset investment by employee.

Attendance marking, user provisioning, company setup, and system controls are not shown in the CEO
login.

## Responsive Navigation

- On phones, use the menu icon in the top-left corner. Selecting a page closes the menu.
- Keyboard users can press Tab once to reveal **Skip to main content**.
- The mobile header shows the current page name and keeps search, notifications, and profile
  controls available.
- Page actions stack on narrow screens and move into a compact row when space is available.
- Most operational lists (attendance, leave, employees, users, devices, audit, assets) show
  card summaries on phones and full tables on tablets and desktops.
- Wide desktop-only tables may still scroll horizontally inside their section; the page itself
  does not widen.
- Work Planner filters stack on phones; timeline view shows assignee groups as cards on phones
  and the full timeline from tablet size upward.
- After sign-in on a phone, you can optionally install Anytime Workforce from
  **Notifications**. Laptop and desktop browsers are not prompted to add the app to the home screen.
- The same permissions apply on mobile, tablet, laptop, and installed PWA displays.

## Login And First Password Change

1. Open the application URL.
2. The sign-in screen shows the Anytime Diesel crew avatar at the top. While you type your
   password (with it hidden), he covers his eyes. If you reveal the password, he looks again.
3. Enter the work email and temporary password issued by the Developer Admin.
4. There is one shared sign-in screen for every role. After authentication, the app opens the
   matching workspace automatically (employee, manager, HR, CEO, Main Admin, or Developer Admin).
5. The dashboard shows today's birthday cards (if any) and urgent/important announcements.
6. Sidebar groups are ordered by role so everyday actions appear first.
7. If the account requires a first password change, enter a new password.
8. After changing the password, the face-registration screen opens for normal accounts when
   Developer Admin has enabled employee face verification.
9. Accept the biometric-consent statement, allow the camera, and capture **centre, left, and right**
   registration photos (saved once). Later check-ins only verify live and do not store new photos.
10. Developer Admin is exempt from face authentication. Normal accounts wait on the blocking
    approval screen until Developer Admin approves them in **Face Security**.
11. A rejected registration displays the reason and allows a new capture.

Public signup is disabled. All accounts are created by the Developer Admin. Use **Need help?** on
the login screen for password-reset guidance.

The login mascot animation respects reduced-motion preferences and falls back to the company logo
if the mascot image cannot load, so sign-in remains usable.

## Dashboard Communications Order

On every dashboard the company communications appear in this order:

1. Today's birthday celebration card(s) — your own card first when applicable
2. Active urgent/important announcements
3. Role dashboard widgets (attendance, team summaries, upcoming birthdays list)

Open **Announcements** from the Me menu for the full board. Notifications focus on actionable
items only: leave/weekly-off decisions, punch corrections, checkout reminders, new tasks, expense
and HR-document decisions, urgent/important announcements, team/company birthday alerts for
managers and HR (own birthday for staff), and your own suspension notice. Routine holidays and
normal announcements are not pushed into the notification list.

Laptop and desktop browsers are not prompted to install or add the app to the home screen. Phone
users can optionally install from **Notifications** if they want a home-screen icon.

## Developer Admin: Create A New Login

1. Open **User Logins**.
2. Select **Create Login**.
3. Select the employer company: Anytime Diesel, Fuelistic Innovations Private Limited, or Royal
   Petro Park Private Limited.
4. Enter identity, personal/company phone, organization, reporting manager, joining, banking,
   statutory, and optional attendance-location details.
5. Enter a temporary password for this account.
6. Save the login and share the email and temporary password with the employee.

Notes:

- Leave and team workflows follow the organization-unit head hierarchy.
- Account creation and organization changes are recorded in audit logs.
- Bank account number, PAN, Aadhaar, and UAN are encrypted. They are not exported through the
  general Employee API.

### Bulk Import Employee Logins

Developer Admin can select **Bulk import** on **User Logins** and download the current `.xlsx`
template. Always download a fresh copy because its reference sheets contain the current companies,
attendance branches, organization units, and reporting managers.

The Employees sheet supports:

- employee code, full name, email, temporary password, personal phone, and company phone;
- employer company, optional attendance branch, main/child organization unit, designation,
  organization level, and reporting manager;
- joining date, date of birth, gender, employment type, and blood group; and
- account holder name, account type, account number, IFSC, PAN, Aadhaar, and optional UAN.

Application role is intentionally not imported directly. The backend derives it from the selected
organization unit and level, preventing a spreadsheet from granting an unauthorized role.
Reporting Manager accepts an existing employee code/email, a code/email from another row in the
same workbook, or `Automatic`. Same-workbook managers are created before their reports.

The upload validates all rows before enabling import, including duplicate accounts, unit hierarchy,
dates, manager references, passwords, and statutory formats. Up to 500 employees can be processed
in one workbook. Every successful row creates the login and canonical employee record through the
normal backend transaction, so encryption, role assignment, employee change events, and audit logs
remain active.

Replace or delete every example row before importing. Rows retaining a `SAMPLE-...` employee code
or the sample email are rejected. Import is row-atomic: a successful row remains saved when a later
row fails, and the result panel identifies exactly which rows must be corrected and retried.

The workbook contains plaintext temporary passwords and any private information entered. Restrict
access to it and permanently delete local/email copies after confirming a successful import.

## Employee: Review My Profile And ID Card

**My Profile** displays identity/contact information first, employment and company information
second, followed by banking and statutory details and an **Emergency contact** section. Employees
can view their emergency contact; HR and Developer Admin can edit it (employees cannot self-edit
pending an approval workflow decision). Sensitive identifiers are masked until the employee selects
the show icon. Attendance access, shift, work assignment, account status, and attendance location
are intentionally kept out of this personal profile.

**Employee ID Card** displays the selected employer and Royal Petro Park Private Limited group,
employee code, designation, department, role, joining date, blood group, and company contact
number. The QR verification page exposes only the minimum active-employment details.

## Developer Admin: Suspend, Deactivate, Or Reactivate A Login

Use **User Logins** for account lifecycle actions.

- **Suspend**: blocks login only for the selected date window. Attendance and employee history remain in the database.
- **Deactivate**: turns off the login until the Developer Admin reactivates it.
- **Blocked**: five consecutive incorrect passwords block login. Only the Developer Admin can reactivate it. Attendance history, biometric mappings, and task assignments are retained.

Employees receive account suspension notifications before the suspension date where the scheduled suspension notification feature is active.

## Developer Admin: Deactivate An Account And Retain History

Use deactivation when an employee should no longer sign in or appear as active.

1. Open **User Logins**.
2. Select **Deactivate account** for the intended user.
3. Review the displayed list of profile, attendance, leave, biometric, asset, expense, task, and audit data that will be retained.
4. Type `DEACTIVATE` exactly.
5. Confirm deactivation.

The employee and login are marked inactive together. The current signed-in account and Developer Admin accounts cannot be deactivated. Developer Admin can reactivate the account later.

## Developer Admin: Reset Testing Data Before Go-Live

Use **System Settings > Production Data Reset** only once the testing period is complete and immediately before entering real employee data.

1. Take and verify a MySQL backup.
2. Sign in with the Developer Admin account that must be preserved.
3. Open **System Settings** and select **Delete all testing data**.
4. Type `DELETE ALL TEST DATA` exactly and enter the current Developer Admin password.
5. Confirm the reset, then verify that User Logins contains only the preserved Developer Admin account.
6. Create the real organization logins from Developer Admin.

The reset preserves the signed-in Developer Admin account, password, branches, departments and
their hierarchy, predefined leave policies, and system settings. Developer Admin remains exempt
from face authentication. The reset clears department-head assignments because the testing
employees are removed. It permanently removes all other users, employees, face
registrations/evidence, attendance, leave balances and requests, tasks, assets, holidays, biometric
devices and mappings, announcements, subscriptions, service requests, notifications derived from
those records, and audit history. The database deletion is transactional; encrypted files belonging
to removed users are purged immediately afterward.

Follow the complete verification and real-data setup sequence in [Reset and Go-Live](RESET_AND_GO_LIVE.md).

## Developer Admin: Create Or Revoke Employee API Access

1. Open **System Settings > Employee API Access**.
2. Enter the trusted application's name and optional expiry date.
3. Select only the required read, write, or event-feed scopes.
4. Select **Create API key** and copy the key immediately; it is shown only once.
5. Store it in the consuming server's secret manager, never in frontend code or source control.
6. Use **Revoke** when the application is retired or the key may have been exposed.

The list shows key prefix, scopes, status, expiry, and last use without exposing the secret. Detailed
integration examples and recovery procedures are in **Employee Data Model and Integration API**.

## Employee: Mark Attendance

Developer Admin assigns each employee a day or night shift and its start/end times while creating the account or from **Employees > Edit Employee**. For night shifts, punches after midnight and before the configured shift end remain part of the date on which the shift started. Mobile and biometric punches can be mixed within the same session.

Employees can use mobile attendance in the current version. Biometric/eSSL attendance is planned for the next version.

1. Open the Dashboard or **My Attendance** and review today's timeline.
2. For **Check In**, allow the front camera and precise location.
3. Keep exactly one face inside the oval, complete the head-turn prompt, return to the centre, and
   hold still while your live face is matched. **No new photo is saved** on check-in.
4. Clear spectacles are supported. Reduce glare if it covers the eyes; remove masks and
   dark/tinted glasses.
5. A different person produces an **Another face detected** popup, is visible in Developer Admin
   **Face Security**, and does not create check-in.
6. For **Check Out**, only precise location is requested; the camera does not open.
7. The operation cannot continue when required permission is denied or GPS accuracy is outside
   policy.
8. If you forget to punch out, you must submit your punch-out time within **two days**. This does
   **not** block tomorrow’s check-in or check-out.
9. Future eSSL/fingerprint imports can appear in the same daily timeline through the separate
   biometric integration workflow.

When Developer Admin pauses face verification, check-in does not open the camera and requires only
fresh precise location. Existing approved registrations remain ready for later re-enablement.

After a successful mobile punch, the status and timer update immediately while the live server timeline refreshes. Keep the page open if the network is slow; the punch button remains disabled while the request is pending to prevent duplicate submissions. Other signed-in devices update through the attendance live stream.

## Employee: Claim An Expense

1. Open **Employee Services** and select **Expenses**.
2. Select **New claim**.
3. Enter title, amount, expense date, description, and a Google Drive attachment link.
4. In Google Drive, set General access to **Anyone with the link** and role to **Viewer**, then select the confirmation checkbox.
5. Submit. The request goes directly to HR.
6. Track Pending, Unpaid, Rejected, or Paid status and read the HR note on the same page.

HR reviews a pending claim first. A claim must be Unpaid before HR can mark it Paid. Payment processing itself remains an HR/accounting action outside the portal.

## Employee: Request An HR Document

1. Open **Employee Services** and select **HR Documents**.
2. Select **New request**.
3. Choose document type, digital or printed delivery, optional required-by date, and explain the purpose.
4. Track Pending, In Progress, Ready, Rejected, or Collected status.
5. Open the document link when HR attaches a completed digital document.

Employees see only their own requests. HR and Developer Admin see the complete request queues.

Example movement timeline:

```mermaid
sequenceDiagram
  participant Employee
  participant Branch1 as Branch 1 Device Next Version
  participant Branch2 as Branch 2 Device Next Version
  participant Mobile as Mobile App
  participant EMS as Anytime Workforce Backend

  Employee->>Branch1: Thumb in
  Branch1->>EMS: Branch in event
  Employee->>Branch1: Thumb out
  Branch1->>EMS: Branch out event
  Employee->>Branch2: Thumb in
  Branch2->>EMS: Branch in event
  Employee->>Branch2: Thumb out
  Branch2->>EMS: Branch out event
  Employee->>Mobile: Client GPS check-in
  Mobile->>EMS: Client check-in event
  Employee->>Mobile: Client GPS check-out
  Mobile->>EMS: Client check-out event
  EMS-->>Employee: Full daily timeline
```

## Employee: Request Missed Punch Correction

Punch-out is **mandatory**. If you forget to check out, submit your actual punch-out time within
**two days** from **Missed Punch Request**. Tomorrow’s check-in and check-out are **not** blocked.
After the two-day window, only HR can unlock and correct the day.

1. Open **Missed Punch Request**.
2. Select the date and punch time.
3. Select the missing event type.
4. Add a clear reason.
5. Submit.

Managers/HR can approve or reject corrections from **Attendance Corrections**.

Full Day / Half Day / Absent, Late, Comp Off, holidays, and face rules are summarized in
[Attendance, Leave, and Face Policy](ATTENDANCE_LEAVE_AND_FACE_POLICY.md).

## Employee: Apply For Leave

1. Open **Apply Leave**.
2. Select leave type.
3. Select from and to dates.
4. Enter the number of days and reason.
5. Submit.

The screen shows the current balance and full rules for Casual Leave, Sick Leave, Unpaid Leave / LOP, and Comp Off. Sick Leave requires a private medical certificate upload (PDF or image) from **Leave History** within 48 hours after returning; public Drive links are not accepted. Reminders are sent at 24 hours and 2 hours before the deadline.

Comp Off requires Reporting Head approval and is consumed only when approved. Credits are valid only until December 31 of the year they are earned. Unused credits expire and cannot be requested in a later year.

### Request a weekly off

Weekly off is selected through this request flow, not while the account is created or edited.

1. Open **Apply Leave** and use **Request weekly off**.
2. Select a date. Non-Sunday dates need at least one day advance approval. Sundays auto-confirm for today or a future Sunday.
3. Submit it to your organization head when approval is required (higher heads in the same chain can also approve).

Only one date is allowed in each Monday–Sunday week. It expires unused, does not carry forward, and cannot be consecutive with another weekly off, including Sunday followed by Monday. Company holidays cannot be selected as weekly offs.

The request is assigned to the nearest organization-unit head above the employee. That head and any higher head in the same parent chain can approve or reject it.

```mermaid
flowchart LR
  A["Employee applies for leave"] --> B["Nearest organization head"]
  B --> H["Higher heads in the same chain"]
  B -->|Approve| C["Approved"]
  H -->|Approve| C
  B -->|Reject| R["Rejected"]
  H -->|Reject| R
  C --> D["Employee may cancel current or future dates"]
  C --> E["Attendance cancels leave for that date"]
```

## Work Planner

Open **Work Planner** for a Jira-style project workspace: **Your work**, project boards, and
issues with persistent keys such as `OPS-12`.

- A **project** (board) is a shared workspace. Anyone with access sees **all** of its issues, not
  only cards assigned to them. Use **Only my issues** when you want a personal slice.
- **Your work** on the landing page lists active issues assigned to you across projects. Use
  **View all** to expand the list or open a project with the Mine filter on.
- Each project has a short **key** (for example `OPS`). New issues receive sequential keys
  (`OPS-1`, `OPS-2`, …). Search supports title, description, assignee, and issue key.
- Issue types are **Task**, **Bug**, **Story**, and **Epic**. Priority marks appear on cards and in
  the detail sheet.
- Soft-archive issues from the detail sheet. Attachments (under 1.5 MB) upload from the detail
  flow; `@employeeCode` mentions in comments notify mentioned people.
- Move an issue to another project from the detail sheet when you have access to both projects.
  Custom fields follow the active project’s field definitions.

Active projects show access policy and open-issue count. Archived projects remain recoverable and
do not accept new work until their owner restores them.

Press **Ctrl/Cmd+K** for global search across pages, people, projects, issues, and announcements.

### Open and navigate a project

1. Select an active project card. The header shows total and open issues for the whole project.
2. Search by key, title, description, or assignee.
3. Use **Only my issues**, assignee, priority, stage, and due-date filters together.
4. Switch among:
   - **Board** (Kanban) for columns and drag-and-drop stage moves; drop on a card to reorder
     within a column (order is stored).
   - **Backlog** for compact, collapsible stage groups and inline stage changes.
   - **Timeline** for start/due-date planning grouped by primary assignee.
5. Use the project selector to move directly to another accessible project.

Wide Board/Timeline content scrolls horizontally on narrow screens. Selecting an issue opens a
right-side detail sheet with editable fields, issue type, assignees, dates, progress, and activity.

### Find and update work

1. Select an issue row, card, timeline bar, or **Your work** entry.
2. Edit summary, description, issue type, priority, dates, stage, project, and assignees in the
   sheet, then **Save**. Managers and admins can change full details; employees may be limited to
   stage, status, progress, and column order depending on policy.
3. Change the stage from the sheet, Backlog stage selector, or by dragging on the Board.
4. Enter a comment or progress note; set the resulting progress; then post the update.

If another session saved the issue first, the app shows a refresh message and does not overwrite
the newer change.

### Create an issue

Open a project and select **Create**, or **Create issue** within a specific stage.

1. Add a short outcome-focused summary.
2. Choose issue type, starting stage, and priority.
3. Add details, start date, and due date as needed. The due date cannot be earlier than the
   start date.
4. Select one or more active assignees. The selection is restricted to people allowed by the
   project and your organization scope.
5. Select **Create**. The issue key, assignment, stage, canonical status, rank, and creation
   activity are stored together.

### Create or configure a project

Authorized leaders select **Create project**. Add a professional name, a **project key**
(2–8 letters/numbers, for example `OPS`), and optional purpose, then configure the workflow:

1. Rename stages and choose their colors.
2. Move stages up or down to set the display order.
3. Add custom stages or remove empty stages.
4. Keep at least one **To do** stage and mark exactly one stage as **Done**.
5. Choose the access policy:
   - **Open**: every account with Work Planner module access.
   - **Role-gated**: only selected application roles.
   - **Member-gated**: only selected active employees.
6. Select **Create** or save project settings.

Only the project owner or Developer Admin can change, archive, or restore it. Renaming the project
key rewrites issue keys for that project when the new keys are free. A stage containing issues
cannot be removed until the issues are moved. Access cannot be narrowed in a way that would hide
current work from one of its assignees.

## Employee Requests

Employee Requests support claim types **Expense**, **Advance**, and **Field**. HR review and
payment remain the same workflow. Travel and fuel claim types are deferred for a later release.

## Checklists

Creating a login auto-starts onboarding; deactivating a login auto-starts offboarding. **HR**
works each checklist: what to provide to the employee and what data to collect, then ticks items
as they finish. HR can also start instances manually and mark complete/cancel/reopen.

**Developer Admin** alone adds, edits, and deletes the onboarding/offboarding process templates
(item titles and in-app links). Managers and employees do not see Checklists.

Payroll/payslips and live biometric device connectors remain out of scope.

## Manager: Review Team Leave And Attendance

Organization heads see employees within their permitted unit hierarchy. Leave and weekly-off actions are available to the employee's nearest head and to higher heads above that unit. Approvals show available balance, days applied for, projected balance after approval, and other pending leave for that person. After a decision, Leave History and Approvals show who approved or rejected the request.

Use:

- **Attendance Overview** for team attendance.
- **Branch Attendance** for branch-wise activity.
- **Field Attendance** for GPS/client work.
- **Attendance Corrections** for missed punch requests.
- **Leave Approvals** for team leave.

## HR: Manage Leave Policies And Credits

1. Open **Leave Policies & Credits**.
2. Review the protected company policy cards.
3. Search for an employee and leave type.
4. Select the edit icon, enter the complete manual adjustment and reason, and save.

Policy types cannot be added, renamed, or deleted. Adjustments are recorded in Audit Logs. Payroll deductions for negative Casual Leave or Unpaid Leave / LOP remain a manual HR responsibility.

## Developer Admin: Manage Departments And Department Heads

1. Open **Departments**.
2. Add or edit a department.
3. Select the department head from active employees.
4. Save.

Department head assignment is stored on the department record. Other authorized roles may receive
department references for directory and report screens, but only Developer Admin changes the
organization structure.

## HR/Admin: Manage Branches

1. Open **Branches**.
2. Add a new branch with code, name, city, address, latitude, longitude, attendance radius, and status.
3. Edit details when a branch changes.
4. Deactivate/delete only when the branch should no longer be used operationally.

## HR/Admin: Manage Biometric Devices And Mapping

Status: planned for the next version. The current application documents the intended eSSL/fingerprint mapping flow, but real device integration is not live yet.

1. Open **Biometric Devices**.
2. Add the eSSL device details, branch, IP, port, and location.
3. Open device mapping.
4. Link each employee to the biometric user ID from the device.

When eSSL integration is added in the next version, imported device punches should create attendance events for mapped employees.

## Holiday Management

1. Open **Holidays**.
2. Add the holiday name, date, classification, and optional description.
3. Holidays are always company-wide.
4. Edit or deactivate the entry when the calendar changes.

Every active entry visible in the Holiday list counts as a holiday for attendance. Public, Optional, and Restricted are classification labels only. A completed Full Day (≥9 hours) on a holiday earns one Comp Off credit (subject to Reporting Head approval when used). Holiday changes recalculate existing summaries for the affected date.

## Developer Admin: Review Face Registrations

1. Open **Face Security**.
2. Use **Employee verification** to enable or pause face checks. Pausing keeps precise GPS required
   and retains existing encrypted registrations.
3. Set registration approval to **Manual** (HR/Dev Admin review) or **Automatic** (approve on successful enroll).
4. Review pending users, the encrypted registration photos (centre/left/right), scores, time, and
   any GPS details.
5. A red **Another face detected** alert means a check-in was blocked because the live face did
   not match that employee (no check-in photo is stored).
6. Select **Approve**, or select **Reject** and give a clear correction reason.
7. Use **Reset** when another employee must register again. The account is blocked immediately only
   while verification is enabled.
8. Use the privacy policy card to set registration-photo retention (default five days), match
   threshold, and maximum accepted GPS error.

The evidence dialog lists retained **registration** photos. Daily check-in does not add photos.
Expired pictures are automatically deleted while non-image audit metadata remains. See
[Face Registration and Verified Attendance](FACE_ATTENDANCE_SECURITY.md).

## Notifications

Notifications are scoped to the signed-in user. Staff see their own leave, birthday, system,
suspension, and workflow items. Managers see team birthday alerts; HR and leadership see
company-wide birthday alerts for today.

Open app sessions receive new announcement updates immediately. Installed/background devices can display Web Push after the user grants notification permission. Browser or operating-system denial must be changed in device settings; the application cannot override it.

## HR/Developer Admin: Announcements

1. Open **Announcements**.
2. Select **New announcement**.
3. Enter a clear title, message, priority, and display-until date/time.
4. Publish. Open employee sessions refresh immediately and subscribed devices receive Web Push.
5. Use **Deactivate** to hide an announcement temporarily, or **Reactivate** to restore it.
6. Use **Permanently delete** only when the announcement must be removed. Type `DELETE` to confirm.

## Reports

Reports include filters for date range, employee, branch, department, source, status, client name, and field work type where supported.

In **Day Logs**, selecting **All Employees** shows a date-first hierarchy. Expand a date to
see its employees, then expand an employee to see every punch for that date. Selecting one
employee shows all available dates directly and removes the unnecessary branch filter.

The Day Logs Excel export applies the selected employee, date, and branch filters. Its first
sheet contains one summary row per employee. **Average Working Time Per Day** is calculated as
the employee's total worked time in the exported records divided by **Days Present**. Employees
with no present days show `00:00:00`. Each employee sheet retains the actual worked time for every
individual date. Holiday, Week Off, and Pending Attendance rows do not count as present unless
worked time was actually recorded.

Common report pages:

- Employee attendance report
- Branch-wise attendance report
- Multi-branch movement report
- Field attendance report
- Client visit report
- Leave report
- Payroll attendance summary

## Asset Management

Open **Asset Management**. The page is organized into tabs:

1. **Employee equipment** — SIMs, mobiles, laptops, powerbanks, and similar items assigned to people.
2. **Company premises** — fans, TVs, tables, chairs, and other branch/location assets (not assigned to
   employees).
3. **Online / subscriptions** — shared seats such as Canva. Enter the full monthly/yearly cost once;
   investment is divided equally across active seats.
4. **Investment** — current monthly/yearly share per employee plus **lifetime** investment (includes
   returned assignments). Company premises assets are excluded from per-employee totals.
5. **Returns** (HR / Developer Admin) — completed return checklists.

When assigning, tick **Show to employee** so that person can see the item under **My Assets** (name,
serial/license, dates — **not** cost). Unticked assignments stay admin-only.

Vehicle registration / insurance / fitness fields are not used in Assets.

Workflow for HR: **Add Asset** → **Assign** (with visibility) → later **Return**. Physical assets
support one assignee; online assets support many seats.

HR and Developer Admin can add, assign, edit, and return assets. CEO access is read-only and opens
on the Investment tab. Every employee can open **My Assets** for visible assignments.

## Mobile Use

The app is designed for phones, tablets, and laptops. See
[DEVICE_COMPATIBILITY.md](DEVICE_COMPATIBILITY.md) for the iPhone, Pixel, Samsung, Vivo, Oppo,
tablet, and desktop release checklist, and [RESPONSIVE_UI_AUDIT.md](RESPONSIVE_UI_AUDIT.md) for
shared layout and accessibility standards.

Recommended mobile workflows:

- Install the app to the Home Screen / desktop for the fastest daily use and alert delivery.
- Employees: My Attendance, Apply Leave, Leave History, Notifications, My Assets, My Profile.
- Field staff: My Attendance with GPS check-in/check-out and client visit details.
- Managers: Leave Approvals and team attendance review (card summaries on phones).
- HR / Admin: Attendance overview and corrections, leave tracking, employee lists — use the menu
  icon, then work from the card list; open the full table view on a tablet or laptop when needed.
- Work Planner: use Board or Backlog on phones; Timeline shows assignee cards on phones and the
  full chart from tablet size upward.
- Notifications: Enable Alerts after install so leave, announcement, and attendance notices arrive
  even when the browser tab is closed (platform rules apply; see Device Compatibility).
