# Employee Profile, Company, Banking, and ID Card

This document defines the employee profile fields, their screen order, storage, permissions,
encryption, login-creation behavior, and ID-card output.

## Company hierarchy

The application separates an employee's legal employer from their attendance location.

| Stored value                            | Display name                          | Parent group                     |
| --------------------------------------- | ------------------------------------- | -------------------------------- |
| `ANYTIME_DIESEL`                        | Anytime Diesel                        | Royal Petro Park Private Limited |
| `FUELISTIC_INNOVATIONS_PRIVATE_LIMITED` | Fuelistic Innovations Private Limited | Royal Petro Park Private Limited |
| `ROYAL_PETRO_PARK_PRIVATE_LIMITED`      | Royal Petro Park Private Limited      | Royal Petro Park Private Limited |

`employees.company_entity` stores the employer. `employees.home_branch_id` remains an optional
attendance/geofence assignment and is labelled **Attendance location** in administration screens.
It is intentionally not shown on the employee's My Profile page or employee ID card.

## Profile field order and storage

| Profile section | UI field            | Canonical storage                                | Required at login creation                                   |
| --------------- | ------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| Identity        | Full name           | `employees.name` and synchronized `users.name`   | Yes                                                          |
| Identity        | Employee code       | `employees.employee_code`                        | Generated when omitted                                       |
| Contact         | Email               | `employees.email` and synchronized `users.email` | Yes                                                          |
| Contact         | Personal phone      | `employees.phone` and synchronized `users.phone` | Optional                                                     |
| Contact         | Company phone       | `employees.company_phone`                        | Optional                                                     |
| Personal        | Date of birth       | `employees.date_of_birth`                        | Optional                                                     |
| Personal        | Gender              | `employees.gender`                               | Optional                                                     |
| Personal        | Blood group         | `employees.blood_group`                          | Optional                                                     |
| Employment      | Employer company    | `employees.company_entity`                       | Yes in the UI; API defaults legacy clients to Anytime Diesel |
| Employment      | Role                | `users.role`                                     | Derived from organization unit and level                     |
| Employment      | Employment type     | `employees.employment_type`                      | Defaults to full-time                                        |
| Employment      | Organization level  | `employees.organization_level`                   | Defaults to member                                           |
| Employment      | Department/unit     | `employees.department_id`                        | Yes                                                          |
| Employment      | Designation         | `employees.designation`                          | Derived when omitted                                         |
| Employment      | Reporting manager   | `employees.manager_id`                           | Selectable or derived from hierarchy                         |
| Employment      | Joining date        | `employees.joining_date`                         | Optional                                                     |
| Banking         | Account holder name | `employees.bank_account_holder_name`             | Optional                                                     |
| Banking         | Account type        | `employees.bank_account_type`                    | Optional                                                     |
| Banking         | IFSC                | `employees.bank_ifsc_code`                       | Optional, validated                                          |
| Banking         | Account number      | encrypted column plus last four                  | Optional                                                     |
| Statutory       | PAN                 | encrypted column plus last four                  | Optional, validated                                          |
| Statutory       | Aadhaar             | encrypted column plus last four                  | Optional, validated                                          |
| Statutory       | UAN                 | encrypted column plus last four                  | Optional                                                     |

The My Profile page deliberately does not show Attendance Access, Assigned Shift, Work Assignment,
Account Status, or Home Branch. Those remain operational settings in their dedicated admin and
attendance screens.

## Self-service profile editing

Developer Admin controls whether employees can edit their own My Profile fields.

1. Open **System Settings > Employee profile editing**.
2. Use the **gear** control to choose allowed fields (identity/contact, banking, statutory,
   emergency contact).
3. Turn the toggle **on**. Employees can then edit only those fields on **My Profile**.

Rules:

- Email, employee code, role, department, manager, company, and other employment fields are never
  self-editable.
- When the toggle is **off**, My Profile stays view-only for employees (HR can still update
  emergency contact; Developer Admin retains full edit).
- Enabling the toggle requires at least one selected field.
- Server enforcement: `PATCH /employees/:id` and `PUT /employees/:id/emergency-contact` reject
  disallowed self-edits even if the UI is bypassed.
- Policy API: `GET/PUT /profile/self-edit-policy` (PUT is Developer Admin only).
- Policy storage: `system_settings` key `employee_profile_self_edit`.

Default stored field selection (while off): personal phone and emergency contact.

### My Profile layout and password fields

- Phones: expandable section cards (identity, employment, banking, statutory, emergency,
  password) with a full-width identity summary above. **Save profile** stays pinned to the
  bottom of the viewport only (safe-area aware); it does not float mid-scroll.
- Laptops: wide two-column open cards; **Save profile** sits at the end of the form, right-aligned.
- Password fields use the shared `PasswordInput`: masked by default, show/hide control fixed
  inside the input (no hover lift). Change password is separate from **Save profile**.

## Encryption and access

Bank account number, PAN, Aadhaar, and UAN are encrypted before Prisma writes them to MySQL.
The stored envelope is `v1.<iv>.<authentication-tag>.<ciphertext>` using AES-256-GCM. Separate
last-four columns support masked UI display and integrity checks without decrypting every row.

`EMPLOYEE_DATA_ENCRYPTION_KEY` must be a stable secret of at least 32 characters in production.
Back it up in the same secret manager as the database credentials. Losing or changing this key
without a controlled re-encryption operation makes existing encrypted values unreadable.

Private fields are returned only to:

- the employee viewing their own record;
- Developer Admin;
- Main Admin;
- HR; and
- CEO.

Managers and ordinary directory viewers do not receive those fields. The browser profile masks
private values by default and provides an explicit show/hide action. Employee API v1 intentionally
does not export banking or statutory identifiers.

## Login creation

Developer Admin creates an employee and login in one transaction. The form collects account,
employer company, organization, reporting, personal, banking, statutory, and attendance data.
Validation runs before the transaction. If any employee or login write fails, neither record is
committed.

The role is derived from the selected organization unit and organization level. Reporting manager
may be chosen explicitly; **Assign from organization structure** selects the nearest unit head and
falls back to the CEO where configured.

## ID card

The signed-in employee ID card shows:

- employer company and Royal Petro Park Private Limited group;
- full name, designation, employee code, department, and role;
- joining date and blood group;
- company phone, falling back to personal phone; and
- a QR code pointing to the public verification page.

The public verification endpoint exposes only active status, name, employee code, designation,
department, employer company, and optional company phone. It does not expose personal email,
personal phone, home branch, banking data, PAN, Aadhaar, UAN, or date of birth.

## Migration and verification

Migration `20260723143000_employee_profile_and_company` adds the company/profile columns and
backfills `employees.blood_group` from existing emergency contacts. Existing employees receive
`ANYTIME_DIESEL` as the non-null compatibility default.

After deployment run:

```bash
npm run db:deploy
npm run db:verify
npm run db:audit
```

The audit verifies supported company values, blood-group values, versioned encrypted envelopes,
matching last-four values, foreign keys, and all pre-existing employee/account invariants.
