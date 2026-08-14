// storage.js - Session storage utilities

const SESSION_STORE_KEY = "saved_sessions";
const CUSTOM_DOMAINS_KEY = "customDomains";

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
    cookies: cookies.map(c => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
      expirationDate: c.expirationDate
    }))
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

async function renameSession(sessionId, newName) {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    session.name = newName.trim();
    session.updatedAt = new Date().toISOString();
    await chrome.storage.local.set({ [SESSION_STORE_KEY]: sessions });
  }
  return session;
}

async function exportSession(sessionId) {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session not found");
  const exportData = { ...session, exportedAt: new Date().toISOString(), exportedBy: "Session Cloner" };
  return JSON.stringify(exportData, null, 2);
}

async function importSession(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.cookies || !Array.isArray(data.cookies))
      throw new Error("Invalid session file: missing cookies array");
    const sessions = await getSessions();
    const session = {
      id: generateId(),
      name: data.name || "Imported Session",
      platform: data.platform || "custom",
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

async function clearAllSessions() {
  await chrome.storage.local.set({ [SESSION_STORE_KEY]: [] });
}

async function getSessionCount() {
  const sessions = await getSessions();
  return sessions.length;
}

// ==================== CUSTOM DOMAINS ====================

async function getCustomDomains() {
  try {
    const result = await chrome.storage.local.get(CUSTOM_DOMAINS_KEY);
    return result[CUSTOM_DOMAINS_KEY] || [];
  } catch (e) {
    console.error("Failed to get custom domains:", e);
    return [];
  }
}

async function addCustomDomain(name, domain, criticalCookies = [], loginUrl = "") {
  const customs = await getCustomDomains();
  const normalized = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (customs.find(c => c.domains.includes(normalized)))
    throw new Error("Domain already exists");
  const entry = {
    id: generateId(),
    name: name.trim(),
    icon: "🌐",
    domains: [normalized, "." + normalized],
    criticalCookies,
    loginUrl: loginUrl || `https://${normalized}`,
    addedAt: new Date().toISOString()
  };
  customs.push(entry);
  await chrome.storage.local.set({ [CUSTOM_DOMAINS_KEY]: customs });
  return entry;
}

async function removeCustomDomain(id) {
  const customs = await getCustomDomains();
  const filtered = customs.filter(c => c.id !== id);
  await chrome.storage.local.set({ [CUSTOM_DOMAINS_KEY]: filtered });
  return filtered;
}
