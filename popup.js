// popup.js
// CRITICAL_COOKIES is defined once here for UI highlighting only
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
// Export for Cookie-Editor button handler
function handleCookieEditorExportClick() {
  showToast("Preparing Cookie-Editor export...", "info");
  chrome.runtime.sendMessage({ action: "exportForCookieEditor" }, (resp) => {
    if (chrome.runtime.lastError) {
      showToast("Error: " + chrome.runtime.lastError.message, "error");
      return;
    }
    if (resp?.success) {
      showToast(`✓ ${resp.message}`, "success", 5000);
    } else {
      showToast("❌ " + (resp?.message || "Export failed"), "error");
    }
  });
}


async function loadSavedSessions() {
  const sessionList = $("sessionList");
  if (!sessionList) return;

  chrome.runtime.sendMessage({ action: "listSessions" }, (resp) => {
    if (chrome.runtime.lastError || !resp?.success) {
      sessionList.innerHTML = "";
      const err = document.createElement("span");
      err.className = "tag";
      err.textContent = "failed to load";
      sessionList.appendChild(err);
      return;
    }

    const sessions = resp.sessions;
    sessionList.innerHTML = "";

    if (sessions.length === 0) {
      const empty = document.createElement("span");
      empty.className = "tag";
      empty.style.margin = "4px 0";
      empty.textContent = "No saved sessions yet";
      sessionList.appendChild(empty);
      return;
    }
    
    sessions.forEach(session => {
      const item = document.createElement("div");
      item.className = "session-item";

      const info = document.createElement("div");
      info.className = "session-info";

      const nameEl = document.createElement("div");
      nameEl.className = "session-name";
      nameEl.textContent = session.name;

      const meta = document.createElement("div");
      meta.className = "session-meta";
      meta.textContent = `${session.cookieCount} cookies · ${new Date(session.updatedAt).toLocaleDateString()}`;

      info.appendChild(nameEl);
      info.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "session-actions";

      const btns = [
        { action: "incognito", title: "Load in incognito", icon: "🕵️" },
        { action: "current",   title: "Load in current browser", icon: "📂" },
        { action: "rename",    title: "Rename", icon: "✏️" },
        { action: "delete",    title: "Delete", icon: "🗑️", cls: "delete" }
      ];

      btns.forEach(({ action, title, icon, cls }) => {
        const btn = document.createElement("button");
        btn.className = "session-btn" + (cls ? ` ${cls}` : "");
        btn.title = title;
        btn.textContent = icon;
        btn.dataset.action = action;
        btn.dataset.id = session.id;
        btn.dataset.name = session.name;
        actions.appendChild(btn);
      });

      item.appendChild(info);
      item.appendChild(actions);
      sessionList.appendChild(item);
    });
    
    // Add event listeners to session buttons
    sessionList.querySelectorAll(".session-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const { action, id, name } = e.currentTarget.dataset;
        handleSessionAction(action, id, name);
      });
    });
  });
}

function handleSessionAction(action, sessionId, sessionName) {
  if (action === "incognito") loadSessionIncognito(sessionId);
  else if (action === "current") loadSessionCurrent(sessionId);
  else if (action === "rename") promptRenameSession(sessionId, sessionName);
  else if (action === "delete") deleteSession(sessionId);
}

function promptRenameSession(sessionId, currentName) {
  const input = $("sessionNameInput");
  const wrap = $("sessionInputWrap");
  input.value = currentName;
  wrap.dataset.renameId = sessionId;
  wrap.style.display = "block";
  input.focus();
}


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
      delete inputWrap.dataset.renameId;
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
  
  const renameId = $("sessionInputWrap").dataset.renameId;
  if (renameId) {
    chrome.runtime.sendMessage({ action: "renameSession", sessionId: renameId, newName: name }, (resp) => {
      if (resp?.success) {
        showToast("Session renamed", "success");
        loadSavedSessions();
      } else {
        showToast("Failed to rename: " + (resp?.message || "Unknown error"), "error");
      }
    });
    delete $("sessionInputWrap").dataset.renameId;
  } else {
    saveCurrentSessionFromPopup(name);
  }
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

// Helper to escape HTML — kept for any future use but session items now use textContent
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  $("btnIncognito").addEventListener("click", handleIncognitoClick);
  $("btnExport").addEventListener("click", handleExportClick);
  $("btnExportCookieEditor").addEventListener("click", handleCookieEditorExportClick);
  initSaveSessionBtn();
  loadSavedSessions();
  refreshCookieStats();
});