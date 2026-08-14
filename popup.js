// popup.js

const CRITICAL_COOKIES = [
  "auth_token", "ct0", "twid", "kdt", "lang",
  "guest_id", "guest_id_ads", "guest_id_marketing",
  "personalization_id", "att", "_twitter_sess"
];

const $ = id => document.getElementById(id);

function showToast(msg, type = "info", duration = 3500) {
  const toast = $("toast");
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.style.display = "block";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = "none"; }, duration);
}

function setLoading(btnId, spinnerId, textId, loading, labelText) {
  const btn = $(btnId);
  const spinner = $(spinnerId);
  const txt = $(textId);
  btn.disabled = loading;
  spinner.style.display = loading ? "block" : "none";
  if (txt) txt.textContent = loading ? "Opening..." : labelText;
  $("loadingBar").style.width = loading ? "70%" : "0%";
}

// Load cookie info on popup open — single DOMContentLoaded at bottom

async function refreshCookieStats() {
  $("criticalCount").textContent = "–";
  $("totalCount").textContent = "–";
  $("cookieTags").innerHTML = `<span class="tag">scanning...</span>`;
  $("statusDot").className = "dot";

  chrome.runtime.sendMessage({ action: "getCookieCount" }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      $("criticalCount").textContent = "0";
      $("totalCount").textContent = "0";
      $("cookieTags").innerHTML = `<span class="tag">no twitter session found</span>`;
      $("statusDot").className = "dot";
      showToast("Log in to Twitter first, then reopen this popup.", "error", 6000);
      return;
    }

    $("criticalCount").textContent = resp.critical;
    $("totalCount").textContent = resp.total;
    $("statusDot").className = resp.critical > 0 ? "dot active" : "dot";

    // Render cookie tags
    const container = $("cookieTags");
    container.innerHTML = "";
    if (resp.names.length === 0) {
      container.innerHTML = `<span class="tag">none found</span>`;
    } else {
      resp.names.forEach(name => {
        const tag = document.createElement("span");
        tag.className = CRITICAL_COOKIES.includes(name) ? "tag critical" : "tag";
        tag.textContent = name;
        container.appendChild(tag);
      });
    }

    if (resp.critical === 0) {
      showToast("No auth cookies found. Are you logged in to Twitter?", "error");
      $("btnIncognito").disabled = true;
    } else {
      showToast(`Found ${resp.critical} auth cookies — ready to clone!`, "success", 2500);
      $("btnIncognito").disabled = false;
    }
  });
}

// Open Incognito button handler
function handleIncognitoClick() {
  setLoading("btnIncognito", "spinIncognito", "btnIncognitoText", true, "Open in Incognito");

  chrome.runtime.sendMessage({ action: "openIncognito" }, (resp) => {
    setLoading("btnIncognito", "spinIncognito", "btnIncognitoText", false, "Open in Incognito");
    $("loadingBar").style.width = "0%";

    if (chrome.runtime.lastError) {
      showToast("Error: " + chrome.runtime.lastError.message, "error");
      return;
    }

    if (resp && resp.success) {
      showToast(`✓ ${resp.message}`, "success");
      // Refresh stats after cloning (cookies may have changed)
      setTimeout(refreshCookieStats, 1000);
    } else {
      showToast("❌ " + (resp?.message || "Unknown error"), "error", 5000);
    }
  });
}

// Export Cookies button handler
function handleExportClick() {
  chrome.runtime.sendMessage({ action: "exportCookies" }, (resp) => {
    if (chrome.runtime.lastError || !resp?.success) {
      showToast("Export failed: " + (resp?.message || "Unknown error"), "error");
      return;
    }

    // Copy JSON to clipboard
    const json = JSON.stringify(resp.data, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      showToast(`✓ ${resp.count} cookies copied to clipboard as JSON`, "success");
    }).catch(() => {
      // Fallback: open in new tab
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      chrome.tabs.create({ url });
      showToast(`✓ Opened cookie JSON in new tab`, "info");
    });
  });
}
// Session Management Functions

async function loadSavedSessions() {
  const sessionList = $("sessionList");
  if (!sessionList) return;
  
  chrome.runtime.sendMessage({ action: "listSessions" }, (resp) => {
    if (chrome.runtime.lastError || !resp?.success) {
      sessionList.innerHTML = `<span class="tag">failed to load</span>`;
      return;
    }
    
    const sessions = resp.sessions;
    const sessionsSection = $("sessionsSection");
    
    if (sessions.length === 0) {
      sessionsSection.style.display = "none";
      return;
    }
    
    sessionsSection.style.display = "block";
    sessionList.innerHTML = "";
    
    sessions.forEach(session => {
      const item = document.createElement("div");
      item.className = "session-item";
      
      const date = new Date(session.updatedAt).toLocaleDateString();
      
      item.innerHTML = `
        <div class="session-info">
          <div class="session-name">${escapeHtml(session.name)}</div>
          <div class="session-meta">${session.cookieCount} cookies · ${date}</div>
        </div>
        <div class="session-actions">
          <button class="session-btn" title="Load in incognito" data-action="incognito" data-id="${session.id}">🕵️</button>
          <button class="session-btn" title="Load in current browser" data-action="current" data-id="${session.id}">📂</button>
          <button class="session-btn delete" title="Delete" data-action="delete" data-id="${session.id}">🗑️</button>
        </div>
      `;
      
      sessionList.appendChild(item);
    });
    
    // Add event listeners to session buttons
    sessionList.querySelectorAll(".session-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const action = e.target.dataset.action;
        const sessionId = e.target.dataset.id;
        handleSessionAction(action, sessionId);
      });
    });
  });
}

function handleSessionAction(action, sessionId) {
  if (action === "incognito") {
    loadSessionIncognito(sessionId);
  } else if (action === "current") {
    loadSessionCurrent(sessionId);
  } else if (action === "delete") {
    deleteSession(sessionId);
  }
}

function loadSessionIncognito(sessionId) {
  showToast("Loading session in incognito...", "info");
  
  chrome.runtime.sendMessage({ action: "loadSessionIncognito", sessionId }, (resp) => {
    if (chrome.runtime.lastError) {
      showToast("Error: " + chrome.runtime.lastError.message, "error");
      return;
    }
    if (resp?.success) {
      showToast(`✓ ${resp.message}`, "success");
    } else {
      showToast("❌ " + (resp?.message || "Failed to load session"), "error");
    }
  });
}

function loadSessionCurrent(sessionId) {
  showToast("Loading cookies into current browser...", "info");
  
  chrome.runtime.sendMessage({ action: "loadSessionCurrent", sessionId }, (resp) => {
    if (chrome.runtime.lastError) {
      showToast("Error: " + chrome.runtime.lastError.message, "error");
      return;
    }
    if (resp?.success) {
      showToast(`✓ ${resp.message}`, "success");
    } else {
      showToast("❌ " + (resp?.message || "Failed to load session"), "error");
    }
  });
}

function deleteSession(sessionId) {
  chrome.runtime.sendMessage({ action: "deleteSession", sessionId }, (resp) => {
    if (resp?.success) {
      showToast("Session deleted", "success");
      loadSavedSessions();
    } else {
      showToast("Failed to delete session", "error");
    }
  });
}

// Save current session
function initSaveSessionBtn() {
  $("btnSaveSession").addEventListener("click", () => {
    const inputWrap = $("sessionInputWrap");
    const isVisible = inputWrap.style.display === "block";
    if (isVisible) {
      inputWrap.style.display = "none";
    } else {
      inputWrap.style.display = "block";
      $("sessionNameInput").focus();
    }
  });
}
// In popup.js, add this after the existing btnSaveSession listener:
$("btnConfirmSave").addEventListener("click", () => {
  const input = $("sessionNameInput");
  const name = input.value.trim();
  
  if (!name) {
    showToast("Please enter a session name", "error");
    return;
  }
  
  saveCurrentSessionFromPopup(name);
  $("sessionInputWrap").style.display = "none";
  input.value = "";
});

$("btnCancelSave").addEventListener("click", () => {
  $("sessionInputWrap").style.display = "none";
  $("sessionNameInput").value = "";
});

function saveCurrentSessionFromPopup(name) {
  showToast("Saving session...", "info");
  chrome.runtime.sendMessage({ action: "saveSession", name }, (saveResp) => {
    if (chrome.runtime.lastError) {
      showToast("Error: " + chrome.runtime.lastError.message, "error");
      return;
    }
    if (saveResp?.success) {
      showToast(`✓ Session "${name}" saved`, "success");
      loadSavedSessions();
    } else {
      showToast("Failed to save session: " + (saveResp?.message || "Unknown error"), "error");
    }
  });
}

// Import session from file
$("btnImportSession").addEventListener("click", async () => {
  try {
    // Create file input
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const text = await file.text();
      chrome.runtime.sendMessage({ action: "importSession", fileContent: text }, (resp) => {
        if (resp?.success) {
          showToast(`✓ Imported session "${resp.session.name}"`, "success");
          loadSavedSessions();
        } else {
          showToast("Import failed: " + (resp?.message || "Unknown error"), "error");
        }
      });
    };
    
    input.click();
  } catch (e) {
    showToast("Failed to open file picker", "error");
  }
});

// Helper to escape HTML
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  $("btnIncognito").addEventListener("click", handleIncognitoClick);
  $("btnExport").addEventListener("click", handleExportClick);
  initSaveSessionBtn();
  loadSavedSessions();
  refreshCookieStats();
});