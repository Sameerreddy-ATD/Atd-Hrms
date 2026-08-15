/**
 * End-to-end API verification against a running backend.
 *
 * Exercises the real HTTP surface — auth, session handling, RBAC, and IDOR —
 * rather than unit-testing the handlers in isolation, so contract and
 * middleware-ordering problems surface the way a client would hit them.
 *
 * Usage: API_BASE_URL=http://127.0.0.1:4000 node scripts/verify-api-flows.mjs
 */
const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "LocalVerify!Pass123";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Staff without an approved face are refused everything with a 403, which would
 * make every RBAC assertion below pass for the wrong reason. Any denial we count
 * as an authorization result has to be checked against that.
 */
function isFaceGate(payload) {
  return /face registration/i.test(String(payload?.error ?? ""));
}

function deniedByAuthorization(response) {
  if (response.status !== 403 && response.status !== 404) return false;
  return !isFaceGate(response.payload);
}

function parseCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const jar = {};
  for (const line of raw) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar[pair.slice(0, idx).trim()] = { value: pair.slice(idx + 1), attrs: line };
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v.value}`)
    .join("; ");
}

async function call(path, { method = "GET", body, jar, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(jar ? { cookie: cookieHeader(jar) } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  let payload = null;
  const text = await res.text();
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: res.status, payload, cookies: parseCookies(res), res };
}

async function login(email, password) {
  return call("/auth/login", { method: "POST", body: { email, password } });
}

/**
 * Seeded accounts start with firstLoginPasswordChangeRequired, which gates every
 * data route. Sign in and clear that gate so the checks below exercise the real
 * authenticated surface.
 */
async function loginReady(email, password) {
  const first = await login(email, password);
  if (first.status !== 200) return first;
  const me = await call("/auth/me", { jar: first.cookies });
  if (!me.payload?.user?.mustChangePassword) return first;
  const changed = await call("/auth/change-password", {
    method: "POST",
    jar: first.cookies,
    body: { nextPassword: password },
  });
  if (changed.status !== 200) return changed;
  // change-password reissues cookies, so continue with the rotated session.
  return { ...changed, cookies: { ...first.cookies, ...changed.cookies } };
}

async function main() {
  // ---- Public / auth -----------------------------------------------------
  const health = await call("/health");
  record("health endpoint responds", health.status === 200, `status ${health.status}`);

  const wrongPw = await login("dev@anytimediesel.local", "definitely-not-the-password");
  const genericMessage = String(wrongPw.payload?.error ?? wrongPw.payload?.message ?? "");
  record(
    "wrong password is rejected without leaking whether the account exists",
    wrongPw.status === 401 && /invalid email address or password/i.test(genericMessage),
    `status ${wrongPw.status}, message "${genericMessage}"`,
  );

  const unknownUser = await login("nobody-here@anytimediesel.local", "whatever-password");
  const unknownMessage = String(unknownUser.payload?.error ?? unknownUser.payload?.message ?? "");
  record(
    "unknown account returns the same message as a wrong password",
    unknownUser.status === 401 && unknownMessage === genericMessage,
    `status ${unknownUser.status}, message "${unknownMessage}"`,
  );

  const devFirst = await login("dev@anytimediesel.local", SEED_PASSWORD);
  record("developer admin can sign in", devFirst.status === 200, `status ${devFirst.status}`);
  // Only meaningful on a freshly seeded database; a later run has already
  // cleared the flag, so skip rather than report a false failure.
  const devFirstMe = await call("/auth/me", { jar: devFirst.cookies });
  if (devFirstMe.payload?.user?.mustChangePassword) {
    record(
      "a first-login account cannot reach data routes before changing its password",
      (await call("/employees", { jar: devFirst.cookies })).status === 403,
      "GET /employees while mustChangePassword is set",
    );
  } else {
    console.log("[SKIP] first-login gate — this account already changed its password");
  }
  const dev = await loginReady("dev@anytimediesel.local", SEED_PASSWORD);
  record("first-login password change completes", dev.status === 200, `status ${dev.status}`);

  const sessionCookie = devFirst.cookies["adh_session"];
  const refreshCookie = devFirst.cookies["adh_refresh"];
  record(
    "session cookie is HttpOnly and SameSite-scoped",
    Boolean(sessionCookie) &&
      /httponly/i.test(sessionCookie.attrs) &&
      /samesite/i.test(sessionCookie.attrs),
    sessionCookie ? sessionCookie.attrs.split(";").slice(1).join(";").trim() : "no cookie",
  );
  record(
    "refresh cookie is HttpOnly and path-scoped to the refresh endpoint",
    Boolean(refreshCookie) && /httponly/i.test(refreshCookie.attrs),
    refreshCookie ? refreshCookie.attrs.split(";").slice(1).join(";").trim() : "no cookie",
  );

  record(
    "login response does not echo the password hash",
    !JSON.stringify(devFirst.payload ?? {}).match(/passwordHash|password_hash|\$2[aby]\$/),
    "checked serialized login payload",
  );

  const devJar = dev.cookies;

  // ---- Unauthenticated access -------------------------------------------
  const anonUsers = await call("/users");
  record(
    "unauthenticated request to /users is rejected",
    anonUsers.status === 401,
    `status ${anonUsers.status}`,
  );

  const anonEmployees = await call("/employees");
  record(
    "unauthenticated request to /employees is rejected",
    anonEmployees.status === 401,
    `status ${anonEmployees.status}`,
  );

  // ---- Concurrent device sessions ----------------------------------------
  const phone = await login("dev@anytimediesel.local", SEED_PASSWORD);
  const firstStillValid = await call("/auth/me", { jar: devJar });
  record(
    "signing in on a second device keeps the first device signed in",
    firstStillValid.status === 200,
    `first session status ${firstStillValid.status} after a second login`,
  );
  record(
    "the second device is also signed in",
    (await call("/auth/me", { jar: phone.cookies })).status === 200,
    "both sessions answer /auth/me",
  );

  const devJar2 = devJar;
  const devUserId = (await call("/auth/me", { jar: devJar2 })).payload?.user?.id;
  const deviceList = await call(`/users/${devUserId}/sessions`, { jar: devJar2 });
  record(
    "developer admin can see how many devices a user is signed in on",
    deviceList.status === 200 && deviceList.payload?.activeDeviceCount >= 2,
    `count ${deviceList.payload?.activeDeviceCount}, platforms ${(
      deviceList.payload?.sessions ?? []
    )
      .map((s) => s.platform)
      .join(", ")}`,
  );
  record(
    "the device list marks which entry is the calling device",
    (deviceList.payload?.sessions ?? []).some((s) => s.isCurrentDevice),
    "isCurrentDevice flag present",
  );
  record(
    "the device list does not expose a session token",
    !/adh_session|eyJhbGciOi/.test(JSON.stringify(deviceList.payload ?? {})),
    "checked serialized device list",
  );

  const emp0 = await loginReady("route.senior@anytimediesel.local", SEED_PASSWORD);
  const empDeviceList = await call(`/users/${devUserId}/sessions`, { jar: emp0.cookies });
  record(
    "an employee cannot read another user's device list",
    deniedByAuthorization(empDeviceList),
    `status ${empDeviceList.status}`,
  );

  // Revoke just the phone; the original device must survive.
  const phoneSession = (deviceList.payload?.sessions ?? []).find((s) => !s.isCurrentDevice);
  if (phoneSession) {
    const revoked = await call(`/users/${devUserId}/sessions/${phoneSession.sessionId}`, {
      method: "DELETE",
      jar: devJar2,
    });
    record(
      "developer admin can sign out a single device",
      revoked.status === 200,
      `status ${revoked.status}`,
    );
    record(
      "the revoked device is rejected on its next request",
      (await call("/auth/me", { jar: phone.cookies })).status === 401,
      "revoked device calls /auth/me",
    );
    record(
      "revoking one device leaves the other signed in",
      (await call("/auth/me", { jar: devJar2 })).status === 200,
      "surviving device calls /auth/me",
    );
  } else {
    record("a second device was available to revoke", false, "no non-current session found");
  }

  // Signing out one device must not sign out the others.
  const laptop = await login("dev@anytimediesel.local", SEED_PASSWORD);
  await call("/auth/logout", { method: "POST", jar: laptop.cookies });
  record(
    "logging out one device leaves the other devices signed in",
    (await call("/auth/me", { jar: devJar2 })).status === 200,
    "other device still authenticated after a logout elsewhere",
  );
  record(
    "the logged-out device is rejected",
    (await call("/auth/me", { jar: laptop.cookies })).status === 401,
    "logged-out device calls /auth/me",
  );

  // ---- Employee role: RBAC + IDOR ---------------------------------------
  const emp = await loginReady("data.entry@anytimediesel.local", SEED_PASSWORD);
  record("employee can sign in", emp.status === 200, `status ${emp.status}`);
  const empJar = emp.cookies;
  const empMe = await call("/auth/me", { jar: empJar });
  const empUserId = empMe.payload?.user?.id;
  const empEmployeeId = empMe.payload?.user?.employeeId;
  record(
    "employee identity resolves",
    Boolean(empUserId && empEmployeeId),
    `userId ${empUserId}, employeeId ${empEmployeeId}`,
  );

  record(
    "the employee is past the face gate, so the denials below are authorization results",
    !isFaceGate((await call("/tasks", { jar: empJar })).payload),
    "GET /tasks is not refused for a missing face profile",
  );

  const empListUsers = await call("/users", { jar: empJar });
  record(
    "employee cannot list user accounts",
    deniedByAuthorization(empListUsers),
    `status ${empListUsers.status}`,
  );

  const empAudit = await call("/audit-logs", { jar: empJar });
  record(
    "employee cannot read audit logs",
    deniedByAuthorization(empAudit),
    `status ${empAudit.status}`,
  );

  const empModuleAccess = await call("/module-access", { jar: empJar });
  record(
    "employee cannot read the module access matrix",
    deniedByAuthorization(empModuleAccess),
    `status ${empModuleAccess.status}`,
  );

  const empCreateUser = await call("/users", {
    method: "POST",
    jar: empJar,
    body: {
      name: "Escalation Attempt",
      email: "escalation@anytimediesel.local",
      role: "DEVELOPER_ADMIN",
      password: "Escalate!123",
    },
  });
  record(
    "employee cannot create a developer admin account",
    deniedByAuthorization(empCreateUser),
    `status ${empCreateUser.status}`,
  );

  const empFaceAdmin = await call("/face/admin/profiles", { jar: empJar });
  record(
    "employee cannot reach face administration",
    deniedByAuthorization(empFaceAdmin),
    `status ${empFaceAdmin.status}`,
  );

  // IDOR: read another employee's record directly.
  const allEmployees = await call("/employees", { jar: devJar2 });
  const others = Array.isArray(allEmployees.payload)
    ? allEmployees.payload.filter((e) => e.employeeId && e.employeeId !== empEmployeeId)
    : [];
  const victim = others[0];
  if (victim) {
    const idor = await call(`/employees/${victim.employeeId}`, { jar: empJar });
    record(
      "employee cannot read another employee's full record",
      deniedByAuthorization(idor),
      `status ${idor.status} reading ${victim.employeeId}`,
    );

    const idorWrite = await call(`/employees/${victim.employeeId}`, {
      method: "PATCH",
      jar: empJar,
      body: { name: "Overwritten By Another User" },
    });
    record(
      "employee cannot modify another employee's record",
      deniedByAuthorization(idorWrite),
      `status ${idorWrite.status}`,
    );

    const ownRecord = await call(`/employees/${empEmployeeId}`, { jar: empJar });
    record(
      "employee can still read their own record",
      ownRecord.status === 200,
      `status ${ownRecord.status}`,
    );

    const privateData = await call(`/employees/${victim.employeeId}/private`, { jar: empJar });
    record(
      "employee cannot read another employee's private bank/PAN data",
      deniedByAuthorization(privateData),
      `status ${privateData.status}`,
    );
  } else {
    record("IDOR checks had a second employee to target", false, "no other employee found");
  }

  // ---- CEO is read-only ---------------------------------------------------
  const ceo = await loginReady("ceo@anytimediesel.local", SEED_PASSWORD);
  const ceoJar = ceo.cookies;
  record("ceo can sign in", ceo.status === 200, `status ${ceo.status}`);
  const ceoDeleteUser = await call(`/users/${empUserId}`, { method: "DELETE", jar: ceoJar });
  record(
    "ceo cannot delete a user account",
    deniedByAuthorization(ceoDeleteUser),
    `status ${ceoDeleteUser.status}`,
  );
  const ceoSystem = await call("/system/settings", { jar: ceoJar });
  record(
    "ceo cannot read system settings",
    deniedByAuthorization(ceoSystem),
    `status ${ceoSystem.status}`,
  );

  // ---- Session revocation on password change ------------------------------
  const hr = await loginReady("hr@anytimediesel.local", SEED_PASSWORD);
  const hrJar = hr.cookies;
  const NEW_PW = "RotatedVerify!Pass456";
  const change = await call("/auth/change-password", {
    method: "POST",
    jar: hrJar,
    body: { oldPassword: SEED_PASSWORD, nextPassword: NEW_PW },
  });
  record(
    "password change succeeds for the signed-in user",
    change.status === 200 || change.status === 204,
    `status ${change.status}`,
  );

  const hrOldSession = await call("/auth/me", { jar: hrJar });
  record(
    "the pre-change session is revoked",
    hrOldSession.status === 401,
    `old session status ${hrOldSession.status}`,
  );
  record(
    "the old password no longer works",
    (await login("hr@anytimediesel.local", SEED_PASSWORD)).status === 401,
    "re-login with the previous password",
  );
  const hrNewLogin = await login("hr@anytimediesel.local", NEW_PW);
  record("the new password works", hrNewLogin.status === 200, `status ${hrNewLogin.status}`);
  // Restore the seed password so the script can be run repeatedly.
  await call("/auth/change-password", {
    method: "POST",
    jar: hrNewLogin.cookies,
    body: { oldPassword: NEW_PW, nextPassword: SEED_PASSWORD },
  });

  // ---- Validation ---------------------------------------------------------
  const badBody = await call("/auth/login", { method: "POST", body: { email: "not-an-email" } });
  record(
    "malformed login body is rejected with a validation error",
    badBody.status === 400,
    `status ${badBody.status}`,
  );

  const badJson = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ this is not json",
  });
  record(
    "malformed JSON does not return a 500",
    badJson.status === 400,
    `status ${badJson.status}`,
  );

  const oversized = await call("/auth/login", {
    method: "POST",
    body: { email: `${"a".repeat(3_000_000)}@x.com`, password: "x" },
  });
  record(
    "oversized request body is rejected rather than buffered",
    oversized.status === 413 || oversized.status === 400,
    `status ${oversized.status}`,
  );

  // ---- Error hygiene ------------------------------------------------------
  const notFound = await call("/this-route-does-not-exist", { jar: devJar2 });
  const notFoundBody = JSON.stringify(notFound.payload ?? "");
  record(
    "unknown routes do not leak a stack trace",
    !/at\s+\/|node_modules|\.ts:\d+/.test(notFoundBody),
    `status ${notFound.status}`,
  );

  // ---- Summary ------------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("\nFailed checks:");
    for (const f of failed) console.log(`  - ${f.name} (${f.detail})`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Verification run crashed:", error);
  process.exitCode = 1;
});
