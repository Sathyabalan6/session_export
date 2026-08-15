// background.js - Service Worker
importScripts("storage.js", "sites.js");

const VALID_SAME_SITE = ["strict", "lax", "none"];

// ==================== SITE RESOLUTION ====================

function getAllProfiles(customDomains) {
  const customs = (customDomains || []).reduce((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {});
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

async function resolveProfile(siteId) {
  const customs = await getCustomDomains();
  const profiles = getAllProfiles(customs);
  return profiles[siteId] || null;
}

// ==================== PERMISSIONS ====================

async function ensureHostPermission(domain) {
  const origin = `https://${domain.replace(/^\./, "")}/*`;
  const has = await chrome.permissions.contains({ origins: [origin] });
  if (has) return true;
  // Must be triggered from user gesture in popup — background can't prompt
  return false;
}

async function requestHostPermissions(domains) {
  const origins = domains.map(d => `https://${d.replace(/^\./, "")}/*`);
  return new Promise(resolve => {
    chrome.permissions.request({ origins }, granted => resolve(granted));
  });
}

// ==================== COOKIE FETCHING ====================

async function getCookiesForProfile(profile) {
  const allCookies = [];
  for (const domain of profile.domains) {
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

async function getCookieInfo(sendResponse) {
  try {
    const { siteId } = await chrome.storage.local.get("siteId");
    const profile = siteId ? await resolveProfile(siteId) : BUILTIN_SITES.twitter;
    if (!profile) { sendResponse({ total: 0, critical: 0, names: [], profile: null }); return; }
    const cookies = await getCookiesForProfile(profile);
    const critical = cookies.filter(c => profile.criticalCookies.includes(c.name));
    sendResponse({
      total: cookies.length,
      critical: critical.length,
      names: cookies.map(c => c.name),
      profile: { id: profile.id, name: profile.name, icon: profile.icon, domains: profile.domains, note: profile.note || null, requiresLocalStorage: profile.requiresLocalStorage || false }
    });
  } catch (e) {
    sendResponse({ total: 0, critical: 0, names: [], error: e.message });
  }
}

// ==================== COOKIE-EDITOR NORMALIZATION ====================

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

// ==================== COOKIE SET HELPER ====================

async function setCookieInStore(cookie, storeId) {
  const url = `https://${cookie.domain.replace(/^\./, "")}${cookie.path}`;
  const params = {
    url, name: cookie.name, value: cookie.value, domain: cookie.domain,
    path: cookie.path, secure: cookie.secure, httpOnly: cookie.httpOnly,
    expirationDate: cookie.expirationDate, storeId
  };
  if (cookie.sameSite && VALID_SAME_SITE.includes(cookie.sameSite)) params.sameSite = cookie.sameSite;
  try {
    await chrome.cookies.set(params);
    return true;
  } catch (e) {
    console.warn(`Could not set cookie: ${cookie.name}`, e.message);
    return false;
  }
}

// ==================== INCOGNITO ====================

async function openIncognitoWithCookies(sendResponse) {
  try {
    const { siteId } = await chrome.storage.local.get("siteId");
    const profile = siteId ? await resolveProfile(siteId) : BUILTIN_SITES.twitter;
    if (!profile) { sendResponse({ success: false, message: "No site profile selected." }); return; }

    if (profile.requiresLocalStorage) {
      sendResponse({ success: false, message: `${profile.name} uses localStorage for auth — cookie cloning is not supported.` });
      return;
    }

    const cookies = await getCookiesForProfile(profile);
    if (cookies.length === 0) {
      sendResponse({ success: false, message: `No cookies found for ${profile.name}. Are you logged in?` });
      return;
    }

    const critical = cookies.filter(c => profile.criticalCookies.includes(c.name));
    const cookiesToUse = critical.length > 0 ? critical : cookies;

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
    if (tabs.length > 0) await chrome.tabs.update(tabs[0].id, { url: profile.loginUrl });

    sendResponse({ success: true, totalCookies: cookiesToUse.length, successCount, failedCookies: errors, message: `Opened incognito with ${successCount}/${cookiesToUse.length} cookies` });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

// ==================== EXPORT ====================

async function exportCookiesToClipboard(sendResponse) {
  try {
    const { siteId } = await chrome.storage.local.get("siteId");
    const profile = siteId ? await resolveProfile(siteId) : BUILTIN_SITES.twitter;
    if (!profile) { sendResponse({ success: false, message: "No site profile selected." }); return; }
    const cookies = await getCookiesForProfile(profile);
    const exportData = {
      exportedAt: new Date().toISOString(),
      source: profile.name,
      cookies: cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: c.expirationDate }))
    };
    await chrome.storage.local.set({ lastExport: exportData });
    sendResponse({ success: true, data: exportData, count: cookies.length });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function exportForCookieEditor(sendResponse) {
  try {
    const { siteId } = await chrome.storage.local.get("siteId");
    const profile = siteId ? await resolveProfile(siteId) : BUILTIN_SITES.twitter;
    if (!profile) { sendResponse({ success: false, message: "No site profile selected." }); return; }
    const cookies = await getCookiesForProfile(profile);
    if (cookies.length === 0) {
      sendResponse({ success: false, message: `No cookies found for ${profile.name}. Are you logged in?` });
      return;
    }
    const normalized = cookies.map(normalizeCookieForCookieEditor);
    const json = JSON.stringify(normalized, null, 2);
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

// ==================== SESSION MANAGEMENT ====================
// All storage functions provided by storage.js via importScripts

async function saveCurrentSession(sessionName, sendResponse) {
  try {
    const { siteId } = await chrome.storage.local.get("siteId");
    const profile = siteId ? await resolveProfile(siteId) : BUILTIN_SITES.twitter;
    if (!profile) { sendResponse({ success: false, message: "No site profile selected." }); return; }
    const cookies = await getCookiesForProfile(profile);
    if (cookies.length === 0) {
      sendResponse({ success: false, message: `No cookies found for ${profile.name}. Are you logged in?` });
      return;
    }
    const session = await saveSession(sessionName, cookies, profile.id);
    sendResponse({ success: true, session, message: `Session "${sessionName}" saved with ${cookies.length} cookies` });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function loadSessionAsIncognito(sessionId, sendResponse) {
  try {
    const session = await getSession(sessionId);
    if (!session) { sendResponse({ success: false, message: "Session not found" }); return; }

    const profile = await resolveProfile(session.platform);
    if (profile?.requiresLocalStorage) {
      sendResponse({ success: false, message: `${profile.name} uses localStorage — cookie-only cloning not supported.` });
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
    const loginUrl = profile?.loginUrl || `https://${session.cookies[0]?.domain?.replace(/^\./, "") || ""}`;
    const tabs = await chrome.tabs.query({ windowId: incognitoWindowId });
    if (tabs.length > 0) await chrome.tabs.update(tabs[0].id, { url: loginUrl });
    sendResponse({ success: true, totalCookies: session.cookies.length, successCount, failedCookies: errors, message: `Loaded session "${session.name}" with ${successCount}/${session.cookies.length} cookies` });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function loadSessionToCurrentBrowser(sessionId, sendResponse) {
  try {
    const session = await getSession(sessionId);
    if (!session) { sendResponse({ success: false, message: "Session not found" }); return; }
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

// ==================== CUSTOM DOMAINS ====================

async function handleAddCustomDomain(name, domain, sendResponse) {
  try {
    const entry = await addCustomDomain(name, domain);
    sendResponse({ success: true, entry });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function handleRemoveCustomDomain(id, sendResponse) {
  try {
    await removeCustomDomain(id);
    sendResponse({ success: true });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function handleListProfiles(sendResponse) {
  try {
    const customs = await getCustomDomains();
    const profiles = getAllProfiles(customs);
    sendResponse({ success: true, profiles });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function handleDetectSite(url, sendResponse) {
  try {
    const customs = await getCustomDomains();
    const profiles = getAllProfiles(customs);
    const profile = detectSiteFromUrl(url, profiles);
    if (profile) await chrome.storage.local.set({ siteId: profile.id });
    sendResponse({ success: true, profile: profile ? { id: profile.id, name: profile.name, icon: profile.icon, domains: profile.domains, note: profile.note || null, requiresLocalStorage: profile.requiresLocalStorage || false } : null });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function handleSetSite(siteId, sendResponse) {
  try {
    await chrome.storage.local.set({ siteId });
    sendResponse({ success: true });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

async function handleRequestPermission(domains, sendResponse) {
  try {
    const origins = domains.map(d => `https://${d.replace(/^\./, "")}/*`);
    chrome.permissions.request({ origins }, granted => {
      sendResponse({ success: granted, message: granted ? "Permission granted" : "Permission denied by user" });
    });
  } catch (e) {
    sendResponse({ success: false, message: e.message });
  }
}

// ==================== MESSAGE LISTENER ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openIncognito")          { openIncognitoWithCookies(sendResponse); return true; }
  if (message.action === "exportCookies")          { exportCookiesToClipboard(sendResponse); return true; }
  if (message.action === "getCookieCount")         { getCookieInfo(sendResponse); return true; }
  if (message.action === "saveSession")            { saveCurrentSession(message.name, sendResponse); return true; }
  if (message.action === "loadSessionIncognito")   { loadSessionAsIncognito(message.sessionId, sendResponse); return true; }
  if (message.action === "loadSessionCurrent")     { loadSessionToCurrentBrowser(message.sessionId, sendResponse); return true; }
  if (message.action === "listSessions")           { listSavedSessions(sendResponse); return true; }
  if (message.action === "deleteSession")          { deleteSavedSession(message.sessionId, sendResponse); return true; }
  if (message.action === "renameSession")          { renameSavedSession(message.sessionId, message.newName, sendResponse); return true; }
  if (message.action === "exportSession")          { exportSessionToFile(message.sessionId, sendResponse); return true; }
  if (message.action === "importSession")          { importSessionFromFile(message.fileContent, sendResponse); return true; }
  if (message.action === "exportForCookieEditor")  { exportForCookieEditor(sendResponse); return true; }
  if (message.action === "listProfiles")           { handleListProfiles(sendResponse); return true; }
  if (message.action === "detectSite")             { handleDetectSite(message.url, sendResponse); return true; }
  if (message.action === "setSite")                { handleSetSite(message.siteId, sendResponse); return true; }
  if (message.action === "requestPermission")      { handleRequestPermission(message.domains, sendResponse); return true; }
  if (message.action === "addCustomDomain")        { handleAddCustomDomain(message.name, message.domain, sendResponse); return true; }
  if (message.action === "removeCustomDomain")     { handleRemoveCustomDomain(message.id, sendResponse); return true; }
});

// ==================== CONTEXT MENU ====================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "cloneSession",
    title: "Clone Session in Incognito",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "cloneSession") {
    // Auto-detect site from the tab URL first
    const customs = await getCustomDomains();
    const profiles = getAllProfiles(customs);
    const profile = detectSiteFromUrl(tab.url, profiles);
    if (profile) await chrome.storage.local.set({ siteId: profile.id });
    openIncognitoWithCookies((response) => {
      if (!response?.success) console.error("Context menu clone failed:", response?.message);
    });
  }
});

chrome.runtime.onStartup.addListener(() => console.log("Session Cloner: Service worker started"));
chrome.runtime.onSuspend.addListener(() => console.log("Session Cloner: Service worker suspended"));
