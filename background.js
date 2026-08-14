// background.js - Service Worker

const TWITTER_DOMAINS = ["twitter.com", "x.com"];
const SESSION_STORE_KEY = "saved_sessions";

// Key cookies needed for Twitter session
const CRITICAL_COOKIES = [
  "auth_token", "ct0", "twid", "kdt", "lang",
  "guest_id", "guest_id_ads", "guest_id_marketing",
  "personalization_id", "att", "_twitter_sess",
  "dnt", "external_referer", "eu_cn", "night_mode"
];

const VALID_SAME_SITE = ["strict", "lax", "none"];

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

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

async function getSessions() {
  try {
    const result = await chrome.storage.local.get(SESSION_STORE_KEY);
    return result[SESSION_STORE_KEY] || [];
  } catch (e) {
    console.error("Failed to get sessions:", e);
    return [];
  }
}

async function saveSession(name, cookies, platform = "twitter") {
  const sessions = await getSessions();
  const session = {
    id: generateId(),
    name: name.trim(),
    platform,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cookieCount: cookies.length,
    cookies: cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: c.expirationDate }))
  };
  sessions.push(session);
  await chrome.storage.local.set({ [SESSION_STORE_KEY]: sessions });
  return session;
}

async function getSession(sessionId) {
  const sessions = await getSessions();
  return sessions.find(s => s.id === sessionId) || null;
}

async function deleteSession(sessionId) {
  const sessions = await getSessions();
  const filtered = sessions.filter(s => s.id !== sessionId);
  await chrome.storage.local.set({ [SESSION_STORE_KEY]: filtered });
  return filtered;
}

async function exportSession(sessionId) {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session not found");
  const exportData = { ...session, exportedAt: new Date().toISOString(), exportedBy: "Twitter Session Cloner" };
  return JSON.stringify(exportData, null, 2);
}

async function importSession(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.cookies || !Array.isArray(data.cookies)) throw new Error("Invalid session file: missing cookies array");
    const sessions = await getSessions();
    const session = {
      id: generateId(),
      name: data.name || "Imported Session",
      platform: data.platform || "twitter",
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cookieCount: data.cookies.length,
      cookies: data.cookies
    };
    sessions.push(session);
    await chrome.storage.local.set({ [SESSION_STORE_KEY]: sessions });
    return session;
  } catch (e) {
    throw new Error("Failed to import session: " + e.message);
  }
}

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