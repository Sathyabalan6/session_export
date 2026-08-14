// background.js - Service Worker
// importScripts makes storage.js functions available in the service worker
importScripts("storage.js");

const TWITTER_DOMAINS = ["twitter.com", "x.com"];

// Key cookies needed for Twitter session
const CRITICAL_COOKIES = [
  "auth_token", "ct0", "twid", "kdt", "lang",
  "guest_id", "guest_id_ads", "guest_id_marketing",
  "personalization_id", "att", "_twitter_sess",
  "dnt", "external_referer", "eu_cn", "night_mode"
];

const VALID_SAME_SITE = ["strict", "lax", "none"];

// ==================== COOKIE-EDITOR NORMALIZATION ====================
// Based on research: sameSite must be "no_restriction"|"lax"|"strict"
// storeId must be null, session+expirationDate are mutually exclusive
function normalizeCookieForCookieEditor(c) {
  // Normalize sameSite per Cookie-Editor schema
  let sameSite = "no_restriction";
  if (c.sameSite) {
    const s = c.sameSite.toLowerCase();
    if (s === "strict") sameSite = "strict";
    else if (s === "lax") sameSite = "lax";
    else sameSite = "no_restriction"; // None / unspecified / anything else
  }

  // secure must be true when sameSite is no_restriction
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

  // Only include expirationDate if NOT a session cookie
  if (!normalized.session && c.expirationDate) {
    normalized.expirationDate = c.expirationDate;
  }

  return normalized;
}

async function exportForCookieEditor(sendResponse) {
  try {
    const cookies = await getTwitterCookies();
    if (cookies.length === 0) {
      sendResponse({ success: false, message: "No Twitter cookies found. Are you logged in?" });
      return;
    }
    const normalized = cookies.map(normalizeCookieForCookieEditor);
    const json = JSON.stringify(normalized, null, 2);

    // Use offscreen document to write to clipboard (MV3 service worker has no DOM)
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({ action: "writeClipboard", text: json });
    await chrome.offscreen.closeDocument();

    sendResponse({ success: true, count: cookies.length, message: `${cookies.length} cookies copied — paste into Cookie-Editor → Import` });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function ensureOffscreenDocument() {
  const existing = await chrome.offscreen.hasDocument?.();
  if (existing) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["CLIPBOARD"],
    justification: "Write Cookie-Editor JSON to clipboard from service worker"
  });
}

// Fetch all Twitter cookies
async function getTwitterCookies() {
  const allCookies = [];
  for (const domain of TWITTER_DOMAINS) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      allCookies.push(...cookies);
    } catch (e) {
      console.warn(`Failed to get cookies for ${domain}:`, e.message);
    }
  }
  const seen = new Map();
  return allCookies.filter(c => {
    const key = `${c.name}|${c.domain}|${c.path}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

async function setCookieInStore(cookie, storeId) {
  const url = `https://${cookie.domain.replace(/^\./, "")}${cookie.path}`;
  const params = { url, name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path, secure: cookie.secure, httpOnly: cookie.httpOnly, expirationDate: cookie.expirationDate, storeId };
  if (cookie.sameSite && VALID_SAME_SITE.includes(cookie.sameSite)) params.sameSite = cookie.sameSite;
  try {
    await chrome.cookies.set(params);
    return true;
  } catch (e) {
    console.warn(`Could not set cookie: ${cookie.name}`, e.message);
    return false;
  }
}

async function openIncognitoWithCookies(sendResponse) {
  try {
    const cookies = await getTwitterCookies();
    if (cookies.length === 0) {
      sendResponse({ success: false, message: "No Twitter cookies found. Please log in first." });
      return;
    }
    const criticalCookies = cookies.filter(c => CRITICAL_COOKIES.includes(c.name));
    const cookiesToUse = criticalCookies.length > 0 ? criticalCookies : cookies;

    const incognitoWindow = await chrome.windows.create({ incognito: true, url: "about:blank", state: "maximized" });
    const incognitoWindowId = incognitoWindow.id;

    let storeId = null;
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const cookieStores = await chrome.cookies.getAllCookieStores();
      const tabs = await chrome.tabs.query({ windowId: incognitoWindowId });
      const tabId = tabs[0]?.id;
      const incognitoStore = cookieStores.find(s => s.tabIds?.includes(tabId));
      if (incognitoStore) storeId = incognitoStore.id;
    } catch (e) {
      console.warn("Could not get incognito cookie store:", e);
    }

    let successCount = 0;
    const errors = [];
    for (const cookie of cookiesToUse) {
      const result = await setCookieInStore(cookie, storeId);
      if (result) successCount++; else errors.push(cookie.name);
    }

    const tabs = await chrome.tabs.query({ windowId: incognitoWindowId });
    if (tabs.length > 0) await chrome.tabs.update(tabs[0].id, { url: "https://x.com/home" });

    sendResponse({ success: true, totalCookies: cookiesToUse.length, successCount, failedCookies: errors, message: `Opened incognito with ${successCount}/${cookiesToUse.length} cookies` });
  } catch (err) {
    sendResponse({ success: false, message: err.message });
  }
}

async function exportCookiesToClipboard(sendResponse) {
  try {
    const cookies = await getTwitterCookies();
    const exportData = { exportedAt: new Date().toISOString(), source: "Twitter/X.com", cookies: cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: c.expirationDate })) };
    await chrome.storage.local.set({ lastExport: exportData });
    sendResponse({ success: true, data: exportData, count: cookies.length });
  } catch (err) {
    sendResponse({ success: false, message: err.message });
  }
}

async function getCookieInfo(sendResponse) {
  try {
    const cookies = await getTwitterCookies();
    const critical = cookies.filter(c => CRITICAL_COOKIES.includes(c.name));
    sendResponse({ total: cookies.length, critical: critical.length, names: cookies.map(c => c.name) });
  } catch (err) {
    sendResponse({ total: 0, critical: 0, names: [], error: err.message });
  }
}

// ==================== SESSION MANAGEMENT ====================
// All storage functions (getSessions, saveSession, getSession, deleteSession,
// renameSession, exportSession, importSession) are provided by storage.js

async function saveCurrentSession(sessionName, sendResponse) {
  try {
    const cookies = await getTwitterCookies();
    if (cookies.length === 0) {
      sendResponse({ success: false, message: "No cookies to save. Are you logged in?" });
      return;
    }
    const session = await saveSession(sessionName, cookies, "twitter");
    sendResponse({ success: true, session, message: `Session "${sessionName}" saved with ${cookies.length} cookies` });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function loadSessionAsIncognito(sessionId, sendResponse) {
  try {
    const session = await getSession(sessionId);
    if (!session) {
      sendResponse({ success: false, message: "Session not found" });
      return;
    }
    const incognitoWindow = await chrome.windows.create({ incognito: true, url: "about:blank", state: "maximized" });
    const incognitoWindowId = incognitoWindow.id;
    let storeId = null;
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const cookieStores = await chrome.cookies.getAllCookieStores();
      const tabs = await chrome.tabs.query({ windowId: incognitoWindowId });
      const tabId = tabs[0]?.id;
      const incognitoStore = cookieStores.find(s => s.tabIds?.includes(tabId));
      if (incognitoStore) storeId = incognitoStore.id;
    } catch (e) {
      console.warn("Could not get incognito cookie store:", e);
    }
    let successCount = 0;
    const errors = [];
    for (const cookie of session.cookies) {
      const url = `https://${cookie.domain.replace(/^\./, "")}${cookie.path}`;
      try {
        await chrome.cookies.set({
          url, name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path,
          secure: cookie.secure, httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite && VALID_SAME_SITE.includes(cookie.sameSite) ? cookie.sameSite : undefined,
          expirationDate: cookie.expirationDate, storeId
        });
        successCount++;
      } catch (e) { errors.push(cookie.name); }
    }
    const tabs = await chrome.tabs.query({ windowId: incognitoWindowId });
    if (tabs.length > 0) await chrome.tabs.update(tabs[0].id, { url: "https://x.com/home" });
    sendResponse({ success: true, totalCookies: session.cookies.length, successCount, failedCookies: errors, message: `Loaded session "${session.name}" with ${successCount}/${session.cookies.length} cookies` });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function loadSessionToCurrentBrowser(sessionId, sendResponse) {
  try {
    const session = await getSession(sessionId);
    if (!session) {
      sendResponse({ success: false, message: "Session not found" });
      return;
    }
    let successCount = 0;
    const errors = [];
    for (const cookie of session.cookies) {
      const url = `https://${cookie.domain.replace(/^\./, "")}${cookie.path}`;
      try {
        await chrome.cookies.set({
          url, name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path,
          secure: cookie.secure, httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite && VALID_SAME_SITE.includes(cookie.sameSite) ? cookie.sameSite : undefined,
          expirationDate: cookie.expirationDate
        });
        successCount++;
      } catch (e) { errors.push(cookie.name); }
    }
    sendResponse({ success: true, totalCookies: session.cookies.length, successCount, failedCookies: errors, message: `Loaded ${successCount}/${session.cookies.length} cookies into current browser` });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function listSavedSessions(sendResponse) {
  try {
    const sessions = await getSessions();
    sendResponse({ success: true, sessions: sessions.map(s => ({ id: s.id, name: s.name, platform: s.platform, createdAt: s.createdAt, updatedAt: s.updatedAt, cookieCount: s.cookieCount })) });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function deleteSavedSession(sessionId, sendResponse) {
  try {
    await deleteSession(sessionId);
    sendResponse({ success: true, message: "Session deleted" });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function renameSavedSession(sessionId, newName, sendResponse) {
  try {
    const session = await renameSession(sessionId, newName);
    if (!session) { sendResponse({ success: false, message: "Session not found" }); return; }
    sendResponse({ success: true, message: "Session renamed" });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function exportSessionToFile(sessionId, sendResponse) {
  try {
    const json = await exportSession(sessionId);
    sendResponse({ success: true, data: json });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function importSessionFromFile(fileContent, sendResponse) {
  try {
    const session = await importSession(fileContent);
    sendResponse({ success: true, session, message: `Imported session "${session.name}" with ${session.cookieCount} cookies` });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

// ==================== MESSAGE LISTENER ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openIncognito") { openIncognitoWithCookies(sendResponse); return true; }
  if (message.action === "exportCookies") { exportCookiesToClipboard(sendResponse); return true; }
  if (message.action === "getCookieCount") { getCookieInfo(sendResponse); return true; }
  if (message.action === "saveSession") { saveCurrentSession(message.name, sendResponse); return true; }
  if (message.action === "loadSessionIncognito") { loadSessionAsIncognito(message.sessionId, sendResponse); return true; }
  if (message.action === "loadSessionCurrent") { loadSessionToCurrentBrowser(message.sessionId, sendResponse); return true; }
  if (message.action === "listSessions") { listSavedSessions(sendResponse); return true; }
  if (message.action === "deleteSession") { deleteSavedSession(message.sessionId, sendResponse); return true; }
  if (message.action === "exportSession") { exportSessionToFile(message.sessionId, sendResponse); return true; }
  if (message.action === "importSession") { importSessionFromFile(message.fileContent, sendResponse); return true; }
  if (message.action === "exportForCookieEditor") { exportForCookieEditor(sendResponse); return true; }
  if (message.action === "renameSession") { renameSavedSession(message.sessionId, message.newName, sendResponse); return true; }
});

// ==================== CONTEXT MENU ====================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "cloneTwitterSession",
    title: "Clone Twitter Session in Incognito",
    contexts: ["page"],
    documentUrlPatterns: ["https://twitter.com/*", "https://x.com/*"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "cloneTwitterSession") {
    openIncognitoWithCookies((response) => {
      if (!response?.success) console.error("Context menu clone failed:", response?.message);
    });
  }
});

chrome.runtime.onStartup.addListener(() => console.log("Twitter Session Cloner: Service worker started"));
chrome.runtime.onSuspend.addListener(() => console.log("Twitter Session Cloner: Service worker suspended"));