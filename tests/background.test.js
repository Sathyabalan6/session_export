// tests/background.test.js
// Run with: node tests/background.test.js

// ==================== INLINE IMPLEMENTATION (no chrome API needed) ====================

function normalizeCookieForCookieEditor(c) {
  let sameSite = "no_restriction";
  if (c.sameSite) {
    const s = c.sameSite.toLowerCase();
    if (s === "strict") sameSite = "strict";
    else if (s === "lax") sameSite = "lax";
    else sameSite = "no_restriction";
  }
  const secure = sameSite === "no_restriction" ? true : c.secure;
  const normalized = {
    domain: c.domain,
    hostOnly: c.hostOnly ?? !c.domain.startsWith("."),
    httpOnly: c.httpOnly,
    name: c.name,
    path: c.path || "/",
    sameSite,
    secure,
    session: c.session ?? !c.expirationDate,
    storeId: null,
    value: c.value ?? ""
  };
  if (!normalized.session && c.expirationDate) normalized.expirationDate = c.expirationDate;
  return normalized;
}

function validateSessionName(name) {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 50;
}

// ==================== TEST RUNNER ====================

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${description}`);
    console.error(`    → ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected)
    throw new Error(`${label || "Value"}: expected "${expected}", got "${actual}"`);
}

// ==================== normalizeCookieForCookieEditor TESTS ====================

console.log("\nnormalizeCookieForCookieEditor:");

test("maps sameSite None → no_restriction", () => {
  const result = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: ".twitter.com", path: "/", secure: false, httpOnly: true, sameSite: "None", session: false, expirationDate: 9999999999 });
  assertEqual(result.sameSite, "no_restriction", "sameSite");
});

test("maps sameSite unspecified → no_restriction", () => {
  const result = normalizeCookieForCookieEditor({ name: "ct0", value: "xyz", domain: ".twitter.com", path: "/", secure: true, httpOnly: false, sameSite: "unspecified", session: false, expirationDate: 9999999999 });
  assertEqual(result.sameSite, "no_restriction", "sameSite");
});

test("maps sameSite Lax → lax (lowercase)", () => {
  const result = normalizeCookieForCookieEditor({ name: "ct0", value: "xyz", domain: ".twitter.com", path: "/", secure: true, httpOnly: false, sameSite: "Lax", session: false, expirationDate: 9999999999 });
  assertEqual(result.sameSite, "lax", "sameSite");
});

test("maps sameSite Strict → strict (lowercase)", () => {
  const result = normalizeCookieForCookieEditor({ name: "ct0", value: "xyz", domain: ".twitter.com", path: "/", secure: true, httpOnly: false, sameSite: "Strict", session: false, expirationDate: 9999999999 });
  assertEqual(result.sameSite, "strict", "sameSite");
});

test("forces secure=true when sameSite is no_restriction", () => {
  const result = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: ".twitter.com", path: "/", secure: false, httpOnly: true, sameSite: "None", session: false, expirationDate: 9999999999 });
  assert(result.secure === true, "secure should be forced true");
});

test("does NOT force secure=true when sameSite is lax", () => {
  const result = normalizeCookieForCookieEditor({ name: "ct0", value: "xyz", domain: ".twitter.com", path: "/", secure: false, httpOnly: false, sameSite: "lax", session: false, expirationDate: 9999999999 });
  assert(result.secure === false, "secure should remain false for lax");
});

test("storeId is always null", () => {
  const result = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: ".twitter.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", storeId: "0", session: false, expirationDate: 9999999999 });
  assert(result.storeId === null, "storeId must be null");
});

test("omits expirationDate when session=true", () => {
  const result = normalizeCookieForCookieEditor({ name: "_twitter_sess", value: "abc", domain: ".twitter.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", session: true, expirationDate: 9999999999 });
  assert(!("expirationDate" in result), "expirationDate must be omitted for session cookies");
});

test("includes expirationDate when session=false", () => {
  const result = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: ".twitter.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", session: false, expirationDate: 1782353540 });
  assertEqual(result.expirationDate, 1782353540, "expirationDate");
});

test("preserves empty string value", () => {
  const result = normalizeCookieForCookieEditor({ name: "guest_id", value: "", domain: ".twitter.com", path: "/", secure: true, httpOnly: false, sameSite: "lax", session: false, expirationDate: 9999999999 });
  assertEqual(result.value, "", "value should be empty string not undefined");
});

test("infers hostOnly=false for domain cookies (leading dot)", () => {
  const result = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: ".twitter.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", session: false, expirationDate: 9999999999 });
  assert(result.hostOnly === false, "hostOnly should be false for .twitter.com");
});

test("infers hostOnly=true for host-only cookies (no leading dot)", () => {
  const result = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: "twitter.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", session: false, expirationDate: 9999999999 });
  assert(result.hostOnly === true, "hostOnly should be true for twitter.com");
});

test("defaults path to / when missing", () => {
  const result = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: ".twitter.com", path: undefined, secure: true, httpOnly: true, sameSite: "lax", session: false, expirationDate: 9999999999 });
  assertEqual(result.path, "/", "path");
});

// ==================== validateSessionName TESTS ====================

console.log("\nvalidateSessionName:");

test("accepts valid name", () => assert(validateSessionName("Work Account"), "should accept"));
test("rejects empty string", () => assert(!validateSessionName(""), "should reject empty"));
test("rejects whitespace only", () => assert(!validateSessionName("   "), "should reject whitespace"));
test("rejects null", () => assert(!validateSessionName(null), "should reject null"));
test("rejects undefined", () => assert(!validateSessionName(undefined), "should reject undefined"));
test("rejects name over 50 chars", () => assert(!validateSessionName("a".repeat(51)), "should reject >50 chars"));
test("accepts name exactly 50 chars", () => assert(validateSessionName("a".repeat(50)), "should accept 50 chars"));

// ==================== RESULTS ====================

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
