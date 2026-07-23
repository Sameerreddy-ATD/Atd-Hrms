# Face Registration and Verified Attendance

## Purpose

Face registration is a mandatory account-activation step after the first password change. Mobile
attendance is accepted only when the signed-in employee completes a randomized live-face challenge,
matches the approved encrypted face template, and supplies precise device location.

This implementation is self-hosted and has no per-check cloud charge. It uses the MIT-licensed
`@vladmandic/human` browser library and models bundled during the frontend build. AWS Rekognition
Face Liveness is not used.

## Account Activation Flow

1. A user signs in with the login created by Developer Admin.
2. A first-time user changes the temporary password.
3. The frontend displays a full-screen, non-dismissible face-registration gate.
4. The backend blocks every protected API except password, logout, session status, and face
   enrollment endpoints until the profile is approved.
5. The user accepts the versioned biometric-consent statement.
6. The server creates a two-minute, single-use session with a cryptographically random nonce and a
   randomized `BLINK`, `TURN_LEFT`, or `TURN_RIGHT` challenge.
7. The camera verifies that exactly one face is present, the face is large and clear enough, the
   anti-spoof and liveness scores pass, and the requested movement is completed.
8. The browser submits the descriptor, encrypted-evidence candidate, scores, session ID, and nonce.
9. The backend consumes the session once, enforces thresholds, rejects a face already assigned to
   another approved account, encrypts the descriptor, encrypts the JPEG, and creates an evidence
   record.
10. Normal accounts enter `PENDING`; the application remains blocked.
11. Developer Admin reviews the image and scores under **Face Security**, then approves or rejects.
12. Approval changes the profile to `APPROVED`; the waiting screen refreshes automatically and opens
    the workspace.

The first Developer Admin is the recovery authority and cannot wait for another account to approve
it. Its first valid enrollment is automatically approved and is recorded in the audit log. A
Developer Admin cannot reset its own approved registration from the interface.

## Enrollment States

| State            | Meaning                                                    | User access                                |
| ---------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `NOT_REGISTERED` | No face template exists                                    | Enrollment, password, session, and logout  |
| `PENDING`        | A valid capture is awaiting Developer Admin review         | Waiting screen, session status, and logout |
| `APPROVED`       | The encrypted template can be used for attendance matching | Normal role/module access                  |
| `REJECTED`       | Developer Admin supplied a correction reason               | Registration can be repeated               |
| `DISABLED`       | Reserved for controlled administrative/security operations | No normal access                           |

## Attendance Flow

1. The employee selects **Check In** or **Check Out**.
2. The browser requests the front-facing camera and fresh, high-accuracy GPS location.
3. GPS accuracy must be within the Developer Admin policy. The default maximum error is 200 metres.
4. The server issues a one-time challenge for the correct attendance purpose.
5. The browser requires one real face, adequate confidence, liveness, anti-spoofing, the challenge
   movement, and a final centred pose.
6. The server verifies session ownership, nonce, expiry, one-time use, thresholds, approved profile,
   descriptor dimensions, similarity, coordinates, and accuracy.
7. Only after verification passes does the backend create the `attendance_events` row and link the
   corresponding `face_evidence` row.
8. If the employee has approved leave, the leave-confirmation response is returned before the
   one-time face session is consumed. Confirmation can safely reuse the same capture while it is
   still valid.
9. A failed verification stores a short-lived failure record but never creates attendance.

Mobile face attendance is always self-service. A privileged user cannot use their own face to create
a mobile punch for another employee. Biometric-device imports and approved HR correction workflows
remain separate server-controlled attendance sources.

## Database Storage

Migration `20260723180000_face_attendance` creates three MySQL tables.

### `face_profiles`

One row per login account:

- `user_id` is unique and references `users.id`;
- `descriptor_encrypted` contains only an AES-256-GCM encrypted numeric template, never a JPEG or
  plaintext descriptor;
- `status`, consent version/time, submission time, approval actor/time, and rejection details form
  the auditable enrollment state;
- deleting a login cascades its profile, but normal account removal is deactivation and retains
  history.

### `face_verification_sessions`

One row per one-time operation:

- owns the randomized purpose and movement challenge;
- stores a SHA-256 nonce hash, never the submitted nonce;
- records device identifier, expiry, creation time, and single-use time;
- stale sessions without evidence are removed automatically.

### `face_evidence`

One row per submitted registration or attendance verification:

- references the user, optional employee, verification session, and optional attendance event;
- stores purpose, outcome, confidence, liveness, anti-spoof, match score, coordinates, GPS accuracy,
  failure reason, capture time, expiry, and deletion time;
- `image_key` references a private encrypted binary file; image bytes are not stored in MySQL and
  are never served from the public frontend directory;
- attendance evidence has a unique one-to-one relationship with `attendance_events`.

The Employee Integration API intentionally excludes face templates, evidence, consent, and
verification sessions. A future application must integrate employee master data through `/api/v1`,
not read biometric tables or MySQL directly.

## Encryption and Private Files

- The same stable `EMPLOYEE_DATA_ENCRYPTION_KEY` used for protected employee fields derives the
  AES-256-GCM key for face templates and evidence files.
- Every evidence file uses a new random 12-byte IV and authentication tag.
- The default local directory is `.face-evidence`; production should set
  `FACE_EVIDENCE_DIR=/var/lib/anytime-crew-hub/face-evidence`.
- The directory must be writable only by the backend service account, excluded from Git, outside
  the Nginx document root, and included in encrypted backup policy only when required by the
  company's privacy policy.
- The authenticated Developer Admin image endpoint decrypts in memory and returns
  `Cache-Control: private, no-store`.
- Never rotate `EMPLOYEE_DATA_ENCRYPTION_KEY` without a reviewed re-encryption procedure. Losing the
  key makes existing templates and evidence unreadable.

## Retention

The default capture retention is five days. Developer Admin can select 1–30 days in **Face
Security**. Changing the policy recalculates active evidence expiry times. The backend runs cleanup
at startup and hourly:

1. finds evidence older than the current retention period;
2. deletes the encrypted file;
3. clears `image_key`;
4. records `deleted_at`;
5. changes the evidence outcome to `EXPIRED`.

The metadata row remains for auditability without retaining the picture. The approved face template
remains until registration is reset or the account lifecycle removes it; otherwise attendance could
not match after the five-day evidence window.

## Developer Admin Operations

The **Face Security** screen is responsive and available only to Developer Admin:

- review counts for approved, pending, and action-required accounts;
- review all retained registration and attendance captures for a user;
- see confidence, liveness, anti-spoof, match, purpose, time, location accuracy, and failure reason;
- approve a pending enrollment;
- reject it with a required correction reason;
- reset another user's registration, immediately restoring the mandatory gate;
- change retention, match threshold, and maximum GPS accuracy.

Every approval, rejection, reset, enrollment, and policy change writes `audit_logs`.

## API Contract

| Method   | Endpoint                                      | Purpose                                        |
| -------- | --------------------------------------------- | ---------------------------------------------- |
| `GET`    | `/face/status`                                | Current user's state and consent text          |
| `POST`   | `/face/session`                               | Create one-time enrollment/attendance session  |
| `POST`   | `/face/enrollment`                            | Submit a registration capture                  |
| `GET`    | `/face/admin/profiles`                        | Developer Admin enrollment overview            |
| `PATCH`  | `/face/admin/profiles/:userId/approve`        | Approve registration                           |
| `PATCH`  | `/face/admin/profiles/:userId/reject`         | Reject with reason                             |
| `DELETE` | `/face/admin/profiles/:userId`                | Reset another user's registration              |
| `GET`    | `/face/admin/settings`                        | Read verification/retention policy             |
| `PATCH`  | `/face/admin/settings`                        | Update policy                                  |
| `GET`    | `/face/admin/evidence?userId=...`             | List retained evidence metadata                |
| `GET`    | `/face/admin/evidence/:evidenceId/image`      | Stream one authorized decrypted JPEG           |
| `POST`   | `/attendance/mobile/check-in` and `check-out` | Create attendance with required face/GPS proof |

All endpoints use the existing HTTP-only cookie authentication, origin validation, rate limiting,
backend role checks, and audit conventions. JSON request size is capped at 2 MB; decoded JPEGs are
capped at 700 KB.

## Browser and Device Requirements

- HTTPS is mandatory outside localhost for camera and precise-location APIs.
- Use a current Chrome, Edge, Safari, or Samsung Internet release with WebGL enabled.
- The browser must allow camera and precise location for the site.
- Only one person may be visible.
- Use even lighting; remove masks and dark glasses.
- The first model load downloads roughly 12 MB of face-model assets and is then browser-cacheable.
- Low-power phones may take longer per detection frame; the UI remains in the verification dialog
  until a stable result is obtained.

Test at 360×800, 390×844, 412×915, 768×1024, 1024×768, and 1440×900. Verify the mandatory gate,
permission denial, registration retry, pending approval, rejection reason, admin evidence dialog,
check-in, leave confirmation, checkout, and session expiry.

## Deployment

Before the first deployment:

```bash
cd /opt/anytime-crew-hub
sudo install -d -m 700 -o ubuntu -g ubuntu /var/lib/anytime-crew-hub/face-evidence
```

Add this stable path to `.env`:

```text
FACE_EVIDENCE_DIR="/var/lib/anytime-crew-hub/face-evidence"
```

Then use the normal protected release sequence:

```bash
npm ci
npm run db:deploy
npm run build
npm run build:backend
pm2 restart atd-backend --update-env
pm2 restart atd-frontend --update-env
```

`npm run build` automatically copies the required Human models from `node_modules` to the ignored
`public/face-models` build input. Do not manually download unversioned models.

The handoff Docker Compose file mounts the persistent `face-evidence` named volume at
`/data/face-evidence`.

## Verification and Troubleshooting

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run build:backend
npm run db:verify
npm run db:audit
```

`db:verify` reports face profile/evidence/session counts and fails for invalid encrypted envelopes,
approval metadata, or attendance links. `db:audit` verifies face foreign keys, encryption markers,
deletion state, GPS completeness, and one-to-one attendance linkage.

Common failures:

| Symptom                            | Check                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Camera does not open               | HTTPS, browser site permission, OS camera permission, another app use  |
| Models do not load                 | `npm run face:models`, build output, proxy/static path `/face-models`  |
| Location is rejected               | Precise location, GPS enabled, policy accuracy, window/outdoor signal  |
| User remains pending               | Developer Admin **Face Security** approval and `/auth/me` connectivity |
| Existing users see a blocking page | Expected: every account must register after this release               |
| Evidence image is unavailable      | Retention expiry, directory ownership, encryption key, disk health     |

## Security Boundary

Self-hosted browser inference avoids cloud charges but browser-reported liveness and GPS are not
equivalent to hardware-backed identity proofing or a managed server-side liveness service. The
random nonce, purpose-bound single-use session, short expiry, randomized movement, anti-spoof
model, encrypted storage, duplicate-template check, backend match, and audit trail materially reduce
casual replay. A user controlling a modified browser/device can still falsify client-computed
signals or device location.

If the business later requires regulated or high-assurance identity proofing, commission a privacy
and threat-model review and replace the capture verifier with a managed/server-side liveness
provider. Keep the current API and table boundaries so the attendance workflow can evolve without
exposing biometric data to the Employee API.
