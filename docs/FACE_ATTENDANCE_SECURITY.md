# Face Registration and Verified Attendance

## Security boundary — read this first

The API runs its own face inference. Every value the verification decision rests on — the face
descriptor, the liveness score, the anti-spoof score, and the face confidence — is computed server
side from the submitted frame by `server/src/faceInference.ts`. The browser sends its own numbers
too, but they are recorded for diagnostics only and are never compared against a threshold. A
crafted HTTP request cannot claim a liveness score, and a descriptor captured from devtools cannot
be replayed, because the descriptor used for matching is the one the server derived from the pixels
it decoded.

What this still is not: a normal RGB phone camera is not depth-sensing Face ID, and GPS coordinates
are client-supplied and spoofable on a rooted device. The anti-spoof and liveness models raise the
cost of a printed photo or a screen replay considerably; they do not make it impossible. Treat face
attendance as a strong deterrent against buddy-punching, not as regulated identity proofing.

`FACE_SERVER_INFERENCE=false` reverts to the old model in which the browser's scores are trusted.
That flag exists as an operational escape hatch. Do not run production with it off.

## Purpose

Face registration happens at punch time while the Developer Admin verification switch is enabled.
Developer Admin is explicitly exempt. When enabled, check-in and check-out require a live face scan
(or a first-time registration scan if none is saved) plus precise location. When paused, camera
verification is disabled at both frontend and backend, but precise GPS remains required.

**Storage rule:** one encrypted registration photo is saved **once** per
person. Daily check-in uploads a frame so the server can analyse it, and **discards** it after
inference — no check-in photo is written to disk. The metadata row (scores, GPS, outcome) is kept
until the retention sweep clears it.

This implementation is self-hosted and has no per-check cloud charge. It uses the MIT-licensed
`@vladmandic/human` library in both places: in the browser for live capture feedback, and on the API
via the tfjs WASM backend for the authoritative analysis. Models are served from `FACE_MODELS_DIR`
(`public/face-models`, populated by `npm run face:models`). AWS Rekognition Face Liveness is not
used.

`@vladmandic/human` and the tfjs packages are pinned to exact versions. A minor upgrade can change
the descriptor space, which would silently break matching against every stored template — treat any
bump as a migration that requires re-enrollment, not a routine dependency update.

### Per-request isolation

Human's defaults reuse the previous result when a frame looks similar to the last one or was seen
within the last few seconds — `skipFrames: 99`, `skipTime: 2500-3000 ms`, `cacheSensitivity: 0.7`.
Those defaults are written for a webcam loop watching one person. On the API, consecutive calls are
different employees, so a cache hit could hand one person's descriptor to another person's request.
The server therefore forces `cacheSensitivity: 0`, `skipAllowed: false`, and `skipFrames`/`skipTime`
of `0` on every submodel, so each request is analysed from scratch. `tests/faceInference.test.ts`
guards this.

Image filters and detector rotation were measured against the browser's configuration and produce
byte-identical embeddings under Node — the browser's filters are canvas/WebGL features that are a
no-op there — so a server-derived descriptor is comparable with a browser-enrolled template.

### Running it in production

| Aspect          | Value                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| Enable / revert | `FACE_SERVER_INFERENCE` (`true` by default; `false` restores client trust)  |
| Model weights   | `FACE_MODELS_DIR`, default `public/face-models`, ~11 MB                     |
| Warm-up         | Models load at backend start; the log line is `Face inference models ready` |
| Latency         | ~1.1 s cold, ~0.45 s warm per frame on 2 vCPU                               |
| Concurrency     | Requests are serialised through one chain so a burst cannot saturate CPU    |

Because inference is CPU-bound and holds the models in the backend process, give the host swap
before enabling face verification for a full workforce on a 2 vCPU box.

## Account Activation Flow

1. A normal user signs in with the login created by Developer Admin.
2. A first-time user changes the temporary password.
3. The workspace opens immediately. Face registration is **not** an app-wide lock.
4. When Developer Admin has face verification on, the first **Check In** or **Check Out** opens
   registration if no face is saved (`NOT_REGISTERED`, `REJECTED`, or `DISABLED`).
5. The user accepts the versioned biometric-consent statement (registration photos only; later
   punches do not store photos).
6. The server creates a two-minute, single-use enrollment session with a cryptographically random
   nonce. Attendance sessions use an automatic face scan (no blink or head turns).
7. Enrollment captures one front photo. It must show exactly
   one face, pass size/lighting/anti-spoof/liveness checks, and hold a stable descriptor.
8. The browser submits that image as the registration evidence.
9. The backend consumes the session once, runs its own inference over the submitted photo, builds
   the template from the descriptor **it** derived (so the approved template is bound to the image
   the admin reviews), enforces thresholds, rejects a face already registered to another account in
   any state, encrypts the template, encrypts the JPEG, and creates an evidence row linked to the
   same session.
10. If auto-approval is on, the same punch finishes on GPS (short grace window) without a second
    camera pass. Later in/out verify the live face and do not store a new photo.
11. If the profile stays `PENDING`, punches are GPS-only until Developer Admin approves.
12. Developer Admin reviews images and scores under **Face Security**, then approves or rejects.

Developer Admin accounts do not enroll a face and are omitted from the registration review list.
This preserves a password-protected recovery authority while normal employee attendance remains
face verified.

Developer Admin can pause the policy from **Face Security**. The API immediately stops creating
face sessions and permits GPS-only check-in and check-out. Existing encrypted templates and retained
evidence are not deleted. Re-enabling requires registration or live verify at punch time for
accounts that do not already have an approved registration.

## Enrollment States

| State            | Meaning                                                    | User access                                                         |
| ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `NOT_REGISTERED` | No face template exists                                    | Full app; punch opens registration when face verification is on     |
| `PENDING`        | A valid capture is awaiting Developer Admin review         | Full app; GPS-only punches until approval                           |
| `APPROVED`       | The encrypted template can be used for attendance matching | Full app; live face verify on check-in and check-out                |
| `REJECTED`       | Developer Admin supplied a correction reason               | Full app; punch opens registration again                            |
| `DISABLED`       | Face authentication is exempt for Developer Admin          | Normal Developer Admin access                                       |

## Attendance Flow

1. For **Check In**, the browser requests the front-facing camera and fresh, high-accuracy GPS.
2. The browser auto-scans the face when it is in frame, then uploads one verified frame. The server
   decodes it, runs detection itself, and compares the descriptor **it** derived against the
   approved template. The uploaded JPEG is analysed in memory and **never written to disk** for
   attendance verify.
3. The server issues a single-use session and verifies session ownership, then its own liveness,
   anti-spoof, and confidence scores, the approved encrypted template, similarity, GPS coordinates,
   and accuracy. A frame containing no face, or more than one face, is rejected.
4. A matching face creates the `attendance_events` row and links a photo-less `face_evidence` audit
   row (scores only).
5. A mismatch displays **Another face detected**, stores a short-lived blocked security event for
   Developer Admin, and never creates attendance.
6. **Check Out** uses the same camera path as check-in: register if no face is saved, otherwise
   live-verify. GPS accuracy is still required.
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
- registration stores one evidence row per session;
- no more than the newest **two** encrypted registration pictures are retained per user
  (`MAX_RETAINED_IMAGES_PER_USER` in `server/src/faceAttendance.ts`; not admin-configurable).

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
in **Face Security**. A second limit retains only the newest two encrypted pictures per person.
Daily check-in does not add pictures, but it does add a metadata row carrying GPS, and that row is
subject to the same time-based retention. Changing the time policy recalculates active evidence
expiry times. The backend runs cleanup at startup and hourly:

1. finds evidence older than the current retention period or outside a user's latest retained set;
2. deletes the encrypted file, if the row has one;
3. clears `image_key`;
4. clears `latitude`, `longitude`, and `location_accuracy`;
5. records `deleted_at`.

The evidence `outcome` is deliberately **not** rewritten. The row survives the image so the record
can still answer whether the verification passed; overwriting that with `EXPIRED` would discard the
one audit-relevant field the row exists for.

Resetting a face registration (Developer Admin → Face Security) deletes the profile **and** its
evidence files and rows immediately, rather than waiting for the sweep. The pre-deletion consent
version and timestamp are copied into the audit entry so the consent history outlives the reset.

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
backend role checks, and audit conventions. `/face/session` and `/face/enrollment` additionally sit
behind a per-account limiter (40 attempts per hour) so a failed match cannot be used as a
high-volume pass/fail oracle. JSON request size is capped at 8 MB; a submitted JPEG is capped at
950 KB encoded and decoded frames must be between 160 and 4096 pixels on each side.

## Browser and Device Requirements

- HTTPS is mandatory outside localhost for camera and precise-location APIs.
- Use a current Chrome, Edge, Safari, or Samsung Internet release with WebGL enabled.
- The browser must allow camera and precise location for the site.
- Only one person may be visible.
- Use even lighting and remove masks or dark/tinted glasses. Normal clear spectacles are supported;
  tilt the screen or face slightly if glare covers the eyes.
- The optimized model set is about 10.7 MB. The browser begins loading it when the user opens the
  check-in dialog, and the service worker caches it for later scans. The API loads its own copy from
  `FACE_MODELS_DIR` at boot, so the first punch of the day does not pay the load cost.
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

## Known gaps

These are understood and accepted rather than overlooked. Revisit them if the threat model changes.

- **Check-out is not face-verified.** Only check-in is gated, so worked-hours pairs are half
  verified. `ATTENDANCE_CHECK_OUT` already flows through the same verifier; enabling it is a policy
  decision, not new code.
- **Geofencing is computed but not enforced.** A punch outside every branch radius is recorded as an
  unattributed "Mobile" punch rather than rejected. GPS accuracy is enforced; position is not.
- **GPS is client-supplied** and spoofable on a rooted device or through devtools.
- **The face scan has no blink or pose challenge.** Capture is automatic once a live face is in frame.
- **No check-in image is retained**, so a disputed punch has scores and GPS to examine but no photo.
  This is a deliberate privacy trade-off disclosed in the consent text.

If the business later requires regulated or high-assurance identity proofing, commission a privacy
and threat-model review and consider a managed liveness provider. Keep the current API and table
boundaries so the attendance workflow can evolve without exposing biometric data to the Employee API.
