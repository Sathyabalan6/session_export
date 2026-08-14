// tests/background.test.js
// Run with: node tests/background.test.js

// ==================== INLINE IMPLEMENTATIONS ====================

const BUILTIN_SITES = {
  twitter:   { id: "twitter",   domains: ["twitter.com", "x.com"],               criticalCookies: ["auth_token", "ct0"] },
  reddit:    { id: "reddit",    domains: ["reddit.com", "www.reddit.com"],        criticalCookies: ["reddit_session", "token_v2"] },
  github:    { id: "github",    domains: ["github.com", "gist.github.com"],       criticalCookies: ["user_session"] },
  instagram: { id: "instagram", domains: ["instagram.com", "www.instagram.com"],  criticalCookies: ["sessionid"] },
  linkedin:  { id: "linkedin",  domains: ["linkedin.com", "www.linkedin.com"],    criticalCookies: ["li_at"] },
  discord:   { id: "discord",   domains: ["discord.com"],                         criticalCookies: [], requiresLocalStorage: true },
  google:    { id: "google",    domains: ["google.com", "mail.google.com"],       criticalCookies: ["SID", "HSID"] }
};

function getAllProfiles(customDomains) {
  const customs = (customDomains || []).reduce((acc, c) => { acc[c.id] = c; return acc; }, {});
  return { ...BUILTIN_SITES, ...customs };
}

function detectSiteFromUrl(url, profiles) {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    for (const profile of Object.values(profiles)) {
      for (const domain of profile.domains) {
        const clean = domain.replace(/^\./, "");
        if (hostname === clean || hostname.endsWith("." + clean)) return profile;
      }
    }
  } catch (_) {}
  return null;
}

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

function validateCustomDomain(domain) {
  if (!domain || typeof domain !== "string") return false;
  const clean = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return clean.length > 0 && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean);
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
  const r = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: ".twitter.com", path: "/", secure: false, httpOnly: true, sameSite: "None", session: false, expirationDate: 9999999999 });
  assertEqual(r.sameSite, "no_restriction", "sameSite");
});
test("maps sameSite unspecified → no_restriction", () => {
  const r = normalizeCookieForCookieEditor({ name: "ct0", value: "xyz", domain: ".twitter.com", path: "/", secure: true, httpOnly: false, sameSite: "unspecified", session: false, expirationDate: 9999999999 });
  assertEqual(r.sameSite, "no_restriction", "sameSite");
});
test("maps sameSite Lax → lax (lowercase)", () => {
  const r = normalizeCookieForCookieEditor({ name: "ct0", value: "xyz", domain: ".twitter.com", path: "/", secure: true, httpOnly: false, sameSite: "Lax", session: false, expirationDate: 9999999999 });
  assertEqual(r.sameSite, "lax", "sameSite");
});
test("maps sameSite Strict → strict (lowercase)", () => {
  const r = normalizeCookieForCookieEditor({ name: "ct0", value: "xyz", domain: ".twitter.com", path: "/", secure: true, httpOnly: false, sameSite: "Strict", session: false, expirationDate: 9999999999 });
  assertEqual(r.sameSite, "strict", "sameSite");
});
test("forces secure=true when sameSite is no_restriction", () => {
  const r = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: ".twitter.com", path: "/", secure: false, httpOnly: true, sameSite: "None", session: false, expirationDate: 9999999999 });
  assert(r.secure === true, "secure should be forced true");
});
test("does NOT force secure=true when sameSite is lax", () => {
  const r = normalizeCookieForCookieEditor({ name: "ct0", value: "xyz", domain: ".twitter.com", path: "/", secure: false, httpOnly: false, sameSite: "lax", session: false, expirationDate: 9999999999 });
  assert(r.secure === false, "secure should remain false for lax");
});
test("storeId is always null", () => {
  const r = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: ".twitter.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", storeId: "0", session: false, expirationDate: 9999999999 });
  assert(r.storeId === null, "storeId must be null");
});
test("omits expirationDate when session=true", () => {
  const r = normalizeCookieForCookieEditor({ name: "_twitter_sess", value: "abc", domain: ".twitter.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", session: true, expirationDate: 9999999999 });
  assert(!("expirationDate" in r), "expirationDate must be omitted for session cookies");
});
test("includes expirationDate when session=false", () => {
  const r = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: ".twitter.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", session: false, expirationDate: 1782353540 });
  assertEqual(r.expirationDate, 1782353540, "expirationDate");
});
test("preserves empty string value", () => {
  const r = normalizeCookieForCookieEditor({ name: "guest_id", value: "", domain: ".twitter.com", path: "/", secure: true, httpOnly: false, sameSite: "lax", session: false, expirationDate: 9999999999 });
  assertEqual(r.value, "", "value should be empty string not undefined");
});
test("infers hostOnly=false for domain cookies (leading dot)", () => {
  const r = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: ".twitter.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", session: false, expirationDate: 9999999999 });
  assert(r.hostOnly === false, "hostOnly should be false for .twitter.com");
});
test("infers hostOnly=true for host-only cookies (no leading dot)", () => {
  const r = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: "twitter.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", session: false, expirationDate: 9999999999 });
  assert(r.hostOnly === true, "hostOnly should be true for twitter.com");
});
test("defaults path to / when missing", () => {
  const r = normalizeCookieForCookieEditor({ name: "auth_token", value: "abc", domain: ".twitter.com", path: undefined, secure: true, httpOnly: true, sameSite: "lax", session: false, expirationDate: 9999999999 });
  assertEqual(r.path, "/", "path");
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

// ==================== detectSiteFromUrl TESTS ====================

console.log("\ndetectSiteFromUrl:");

test("detects twitter.com", () => assertEqual(detectSiteFromUrl("https://twitter.com/home", BUILTIN_SITES)?.id, "twitter", "id"));
test("detects x.com", () => assertEqual(detectSiteFromUrl("https://x.com/home", BUILTIN_SITES)?.id, "twitter", "id"));
test("detects reddit.com", () => assertEqual(detectSiteFromUrl("https://www.reddit.com/r/programming", BUILTIN_SITES)?.id, "reddit", "id"));
test("detects github.com", () => assertEqual(detectSiteFromUrl("https://github.com/user/repo", BUILTIN_SITES)?.id, "github", "id"));
test("detects gist.github.com as github", () => assertEqual(detectSiteFromUrl("https://gist.github.com/user/abc", BUILTIN_SITES)?.id, "github", "id"));
test("detects instagram.com", () => assertEqual(detectSiteFromUrl("https://www.instagram.com/explore", BUILTIN_SITES)?.id, "instagram", "id"));
test("detects discord.com", () => assertEqual(detectSiteFromUrl("https://discord.com/channels/@me", BUILTIN_SITES)?.id, "discord", "id"));
test("detects linkedin.com", () => assertEqual(detectSiteFromUrl("https://www.linkedin.com/feed", BUILTIN_SITES)?.id, "linkedin", "id"));
test("detects mail.google.com as google", () => assertEqual(detectSiteFromUrl("https://mail.google.com/mail/u/0", BUILTIN_SITES)?.id, "google", "id"));
test("returns null for unknown site", () => assert(detectSiteFromUrl("https://unknown-site-xyz.com", BUILTIN_SITES) === null, "should return null"));
test("returns null for null url", () => assert(detectSiteFromUrl(null, BUILTIN_SITES) === null, "should return null"));
test("returns null for chrome:// url", () => assert(detectSiteFromUrl("chrome://extensions", BUILTIN_SITES) === null, "should return null"));
test("detects custom domain added by user", () => {
  const profiles = getAllProfiles([{ id: "myapp", name: "My App", domains: ["myapp.com", ".myapp.com"], criticalCookies: [] }]);
  assertEqual(detectSiteFromUrl("https://myapp.com/dashboard", profiles)?.id, "myapp", "id");
});
test("discord flagged as requiresLocalStorage", () => assert(BUILTIN_SITES.discord.requiresLocalStorage === true, "discord should require localStorage"));

// ==================== validateCustomDomain TESTS ====================

console.log("\nvalidateCustomDomain:");

test("accepts valid domain", () => assert(validateCustomDomain("myapp.com"), "should accept"));
test("accepts domain with subdomain", () => assert(validateCustomDomain("app.mysite.io"), "should accept"));
test("strips https:// prefix", () => assert(validateCustomDomain("https://myapp.com"), "should accept with prefix"));
test("rejects empty string", () => assert(!validateCustomDomain(""), "should reject"));
test("rejects null", () => assert(!validateCustomDomain(null), "should reject"));
test("rejects plain word without TLD", () => assert(!validateCustomDomain("localhost"), "should reject"));

// ==================== RESULTS ====================

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
