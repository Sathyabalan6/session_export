// storage.js - Session storage for cross-session transmission

const SESSION_STORE_KEY = "saved_sessions";

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Get all saved sessions
async function getSessions() {
  try {
    const result = await chrome.storage.local.get(SESSION_STORE_KEY);
    return result[SESSION_STORE_KEY] || [];
  } catch (e) {
    console.error("Failed to get sessions:", e);
    return [];
  }
}

// Save a new session
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
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      expirationDate: c.expirationDate
    }))
  };
  
  sessions.push(session);
  await chrome.storage.local.set({ [SESSION_STORE_KEY]: sessions });
  return session;
}

// Get a specific session by ID
async function getSession(sessionId) {
  const sessions = await getSessions();
  return sessions.find(s => s.id === sessionId) || null;
}

// Delete a session
async function deleteSession(sessionId) {
  const sessions = await getSessions();
  const filtered = sessions.filter(s => s.id !== sessionId);
  await chrome.storage.local.set({ [SESSION_STORE_KEY]: filtered });
  return filtered;
}

// Update session name
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

// Export session as JSON string
async function exportSession(sessionId) {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session not found");
  
  const exportData = {
    ...session,
    exportedAt: new Date().toISOString(),
    exportedBy: "Twitter Session Cloner"
  };
  
  return JSON.stringify(exportData, null, 2);
}

// Import session from JSON string
async function importSession(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    
    if (!data.cookies || !Array.isArray(data.cookies)) {
      throw new Error("Invalid session file: missing cookies array");
    }
    
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

// Clear all sessions
async function clearAllSessions() {
  await chrome.storage.local.set({ [SESSION_STORE_KEY]: [] });
}

// Get session count
async function getSessionCount() {
  const sessions = await getSessions();
  return sessions.length;
}