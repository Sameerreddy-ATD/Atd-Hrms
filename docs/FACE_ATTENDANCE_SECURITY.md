# Face Registration and Verified Attendance

## Purpose

Face registration is an account-activation step for every normal application account while the
Developer Admin verification switch is enabled. Developer Admin is explicitly exempt. When enabled,
mobile check-in requires a randomized live-face challenge, an approved encrypted multi-sample
template match, and precise location. When paused, enrollment gating and check-in camera
verification are disabled at both frontend and backend, but precise GPS remains required. Check-out
is always camera-free and location-verified.

**Storage rule:** encrypted registration photos (centre, left, right) are saved **once** per person.
Daily check-in **verifies only** and does **not** store a new photo.

This implementation is self-hosted and has no per-check cloud charge. It uses the MIT-licensed
`@vladmandic/human` browser library and models bundled during the frontend build. AWS Rekognition
Face Liveness is not used.

## Account Activation Flow

1. A normal user signs in with the login created by Developer Admin.
2. A first-time user changes the temporary password.
3. The frontend displays a full-screen, non-dismissible face-registration gate.
4. The backend blocks every protected API except password, logout, session status, and face
   enrollment endpoints until the profile is approved.
5. The user accepts the versioned biometric-consent statement (registration photos only; check-in
   does not store photos).
6. The server creates a two-minute, single-use enrollment session with a cryptographically random
   nonce. Attendance sessions use a `BLINK` challenge only (no head turns).
7. Enrollment captures three directions in order: **centre**, **left**, **right**. Each angle must
   show exactly one face, pass size/lighting/anti-spoof/liveness checks, and hold stable descriptors.
8. The browser submits the centre image as the primary evidence image, left/right images as
   additional enrollment evidence, and descriptors from all angles as the multi-sample template.
9. The backend consumes the session once, enforces thresholds, rejects a face already assigned to
   another approved account, encrypts the template, encrypts the three JPEGs, and creates evidence
   rows linked to the same session.
10. Normal accounts enter `PENDING`; the application remains blocked.
11. Developer Admin reviews the images and scores under **Face Security**, then approves or rejects.
12. Approval changes the profile to `APPROVED`; the waiting screen refreshes automatically and opens
    the workspace.

Developer Admin accounts bypass the face-registration gate at both frontend and backend layers.
They do not enroll a face and are omitted from the registration review list. This preserves a
password-protected recovery authority while normal employee attendance remains face verified.

Developer Admin can pause the policy from **Face Security**. The API immediately stops creating
face sessions, treats employee enrollment as non-blocking, and permits GPS-only check-in. Existing
encrypted templates and retained evidence are not deleted. Re-enabling restores the gate only for
accounts that do not already have an approved registration.

## Enrollment States

| State            | Meaning                                                    | User access                                |
| ---------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `NOT_REGISTERED` | No face template exists                                    | Enrollment, password, session, and logout  |
| `PENDING`        | A valid capture is awaiting Developer Admin review         | Waiting screen, session status, and logout |
| `APPROVED`       | The encrypted template can be used for attendance matching | Normal role/module access                  |
| `REJECTED`       | Developer Admin supplied a correction reason               | Registration can be repeated               |
| `DISABLED`       | Face authentication is exempt for Developer Admin          | Normal Developer Admin access              |

## Attendance Flow

1. For **Check In**, the browser requests the front-facing camera and fresh, high-accuracy GPS.
2. Live descriptors are sampled after the head-turn challenge. The backend compares the strongest
   sample pairs against the approved multi-angle template. **No JPEG is uploaded or stored** for
   attendance verify.
3. The server issues a single-use head-turn challenge and verifies session ownership, liveness,
   anti-spoofing, the approved encrypted template, similarity, GPS coordinates, and accuracy.
4. A matching face creates the `attendance_events` row and links a photo-less `face_evidence` audit
   row (scores only).
5. A mismatch displays **Another face detected**, stores a short-lived blocked security event for
   Developer Admin, and never creates attendance.
6. For **Check Out**, the browser does not request or open the camera. It obtains fresh precise GPS,
   and the backend validates the authenticated employee, active check-in, and configured GPS
   accuracy before saving check-out.
7. GPS accuracy must be within the Developer Admin policy. The default maximum error is 200 metres.
8. If the employee has approved leave, the leave-confirmation response is returned before the
   one-time face session is consumed. Confirmation can safely reuse the same capture while it is
   still valid.
9. Other failed check-in verifications store a short-lived failure record but never create
   attendance.
10. If Developer Admin pauses verification, check-in follows the same precise-GPS validation but
    skips camera capture, face evidence, and face-session creation.
11. A prior-day missed checkout or open punch does not block check-in. See
    [Attendance, Leave, and Face Policy](ATTENDANCE_LEAVE_AND_FACE_POLICY.md).

Mobile face attendance is always self-service. A privileged user cannot use their own face to create
a mobile punch for another employee. Biometric-device imports and approved HR correction workflows
remain separate server-controlled attendance sources.

## Database Storage

Migration `20260723180000_face_attendance` creates three MySQL tables.

### `face_profiles`

One row per login account:

- `user_id` is unique and references `users.id`;
- `descriptor_encrypted` contains only an AES-256-GCM encrypted versioned numeric template with a
  centroid and multi-angle samples (centre/left/right plus live samples), never a JPEG or plaintext
  descriptor;
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
  are never served from the public frontend directory. Attendance verify may create scores-only
  rows with `image_key` null (no daily photo storage);
- passed check-in evidence has a unique one-to-one relationship with `attendance_events` when linked;
- registration may store multiple evidence rows per session (centre/left/right);
- no more than the newest encrypted registration pictures are retained per user (default cap six).

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

The default retention for **registration photos** is five days. Developer Admin can select 1–30 days
in **Face Security**. A second limit retains only the newest encrypted pictures per person (default
cap six, covering multi-angle enrollment). Daily check-in does not add pictures. Changing the time
policy recalculates active evidence expiry times. The backend runs cleanup at startup and hourly:

1. finds evidence older than the current retention period or outside a user's latest retained set;
2. deletes the encrypted file;
3. clears `image_key`;
4. records `deleted_at`;
5. changes the evidence outcome to `EXPIRED`.

The metadata row remains for auditability without retaining the picture. The approved face template
remains until registration is reset or the account lifecycle removes it; otherwise attendance could
not match after the photo retention window.

## Developer Admin Operations

The **Face Security** screen is responsive and available only to Developer Admin:

- review counts for approved, pending, action-required, and latest face-mismatch alerts;
- review all retained registration and attendance captures for a user;
- see confidence, liveness, anti-spoof, match, purpose, time, location accuracy, and failure reason;
- approve a pending enrollment;
- reject it with a required correction reason;
- reset another user's registration, immediately restoring the mandatory gate;
- change retention, match threshold, and maximum GPS accuracy.
- turn employee face verification on or off; the change is backend-enforced and does not delete
  registrations.

Every approval, rejection, reset, enrollment, and policy change writes `audit_logs`.

## API Contract

| Method   | Endpoint                                 | Purpose                                                      |
| -------- | ---------------------------------------- | ------------------------------------------------------------ |
| `GET`    | `/face/status`                           | Current user's state and consent text                        |
| `POST`   | `/face/session`                          | Create one-time enrollment/attendance session                |
| `POST`   | `/face/enrollment`                       | Submit a registration capture                                |
| `GET`    | `/face/admin/profiles`                   | Developer Admin enrollment overview                          |
| `PATCH`  | `/face/admin/profiles/:userId/approve`   | Approve registration                                         |
| `PATCH`  | `/face/admin/profiles/:userId/reject`    | Reject with reason                                           |
| `DELETE` | `/face/admin/profiles/:userId`           | Reset another user's registration                            |
| `GET`    | `/face/admin/settings`                   | Read verification/retention policy                           |
| `PATCH`  | `/face/admin/settings`                   | Update policy                                                |
| `GET`    | `/face/admin/evidence?userId=...`        | List retained evidence metadata                              |
| `GET`    | `/face/admin/evidence/:evidenceId/image` | Stream one authorized decrypted JPEG                         |
| `POST`   | `/attendance/mobile/check-in`            | Create check-in with policy-controlled face and required GPS |
| `POST`   | `/attendance/mobile/check-out`           | Create check-out with fresh precise GPS                      |

All endpoints use the existing HTTP-only cookie authentication, origin validation, rate limiting,
backend role checks, and audit conventions. JSON request size is capped at 2 MB; decoded JPEGs are
capped at 700 KB.

## Browser and Device Requirements

- HTTPS is mandatory outside localhost for camera and precise-location APIs.
- Use a current Chrome, Edge, Safari, or Samsung Internet release with WebGL enabled.
- The browser must allow camera and precise location for the site.
- Only one person may be visible.
- Use even lighting and remove masks or dark/tinted glasses. Normal clear spectacles are supported;
  tilt the screen or face slightly if glare covers the eyes.
- The optimized model set is about 10.2 MB, starts preloading after the dashboard opens, compiles in
  the background, and is browser-cacheable for later scans.
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

The default and recommended match threshold is `0.50`. Settings saved by the earlier single-template
release without the verification toggle are read at no more than `0.50` until Developer Admin next
saves policy. Raising the value makes matching stricter and can increase false rejections.

## Recognition Engine and Limits

The implementation continues to use the MIT-licensed Human library already bundled with the
application. Its official FaceID example uses a `0.50` match threshold, and its distance
documentation describes similarity above `0.50` as a match under default normalization:

- [Human source and license](https://github.com/vladmandic/human)
- [Official FaceID example](https://vladmandic.github.io/human/demo/faceid/index.html)
- [Official descriptor-distance documentation](https://vladmandic.github.io/human/typedoc/functions/match.distance.html)

The five-sample matcher improves stability without adding a paid cloud dependency or sending face
data to a third party. It does not turn a normal RGB phone camera into depth-sensing Face ID.

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
