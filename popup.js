// popup.js

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

// ==================== SITE DETECTION ====================

let currentProfile = null;
let allProfiles = {};

async function initSiteDetection() {
  // Load all profiles
  chrome.runtime.sendMessage({ action: "listProfiles" }, (resp) => {
    if (resp?.success) allProfiles = resp.profiles;
    renderSiteSelector();
  });

  // Auto-detect from active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url;
    if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
      loadLastUsedSite();
      return;
    }
    chrome.runtime.sendMessage({ action: "detectSite", url }, (resp) => {
      if (resp?.profile) {
        currentProfile = resp.profile;
        updateSiteDisplay(resp.profile);
        checkAndRequestPermission(resp.profile);
      } else {
        loadLastUsedSite();
      }
      refreshCookieStats();
    });
  });
}

function loadLastUsedSite() {
  chrome.storage.local.get("siteId", ({ siteId }) => {
    if (siteId && allProfiles[siteId]) {
      currentProfile = allProfiles[siteId];
      updateSiteDisplay(currentProfile);
    }
    refreshCookieStats();
  });
}

function updateSiteDisplay(profile) {
  $("siteIcon").textContent = profile.icon || "🌐";
  $("siteName").textContent = profile.name;

  const noteEl = $("siteNote");
  if (profile.note || profile.requiresLocalStorage) {
    noteEl.textContent = profile.note || "Auth uses localStorage — cookie cloning not supported.";
    noteEl.style.display = "block";
  } else {
    noteEl.style.display = "none";
  }

  $("btnIncognito").disabled = !!profile.requiresLocalStorage;
}

function renderSiteSelector() {
  const list = $("siteList");
  list.innerHTML = "";
  Object.values(allProfiles).forEach(profile => {
    const btn = document.createElement("button");
    btn.className = "site-chip" + (currentProfile?.id === profile.id ? " active" : "");
    btn.textContent = `${profile.icon || "🌐"} ${profile.name}`;
    btn.dataset.id = profile.id;
    btn.addEventListener("click", () => selectSite(profile.id));
    list.appendChild(btn);
  });
}

function selectSite(siteId) {
  chrome.runtime.sendMessage({ action: "setSite", siteId }, () => {
    currentProfile = allProfiles[siteId];
    updateSiteDisplay(currentProfile);
    renderSiteSelector();
    checkAndRequestPermission(currentProfile);
    refreshCookieStats();
  });
}

function checkAndRequestPermission(profile) {
  if (!profile || profile.id === "twitter") return; // twitter has install-time permission
  const origins = [...new Set(profile.domains.map(d => `https://${d.replace(/^\./, "")}/*`))];
  chrome.permissions.contains({ origins }, (has) => {
    if (!has) showPermissionBanner(profile);
    else $("permissionBanner").style.display = "none";
  });
}

function showPermissionBanner(profile) {
  const banner = $("permissionBanner");
  banner.style.display = "block";
  $("permissionBannerText").textContent = `Grant access to ${profile.name} cookies`;
  $("btnGrantPermission").onclick = () => {
    chrome.runtime.sendMessage({ action: "requestPermission", domains: profile.domains }, (resp) => {
      if (resp?.success) {
        banner.style.display = "none";
        showToast(`✓ Access granted for ${profile.name}`, "success");
        refreshCookieStats();
      } else {
        showToast("Permission denied — cannot read cookies for this site.", "error");
      }
    });
  };
}

// ==================== COOKIE STATS ====================

async function refreshCookieStats() {
  $("criticalCount").textContent = "–";
  $("totalCount").textContent = "–";
  $("cookieTags").innerHTML = `<span class="tag">scanning...</span>`;
  $("statusDot").className = "dot";

  chrome.runtime.sendMessage({ action: "getCookieCount" }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      $("criticalCount").textContent = "0";
      $("totalCount").textContent = "0";
      $("cookieTags").innerHTML = `<span class="tag">no session found</span>`;
      $("statusDot").className = "dot";
      showToast("Log in to the site first, then reopen this popup.", "error", 6000);
      return;
    }

    $("criticalCount").textContent = resp.critical;
    $("totalCount").textContent = resp.total;
    $("statusDot").className = resp.critical > 0 ? "dot active" : "dot";

    const container = $("cookieTags");
    container.innerHTML = "";
    if (!resp.names || resp.names.length === 0) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "none found";
      container.appendChild(tag);
    } else {
      const criticalSet = new Set(resp.profile ? (allProfiles[resp.profile.id]?.criticalCookies || []) : []);
      resp.names.forEach(name => {
        const tag = document.createElement("span");
        tag.className = criticalSet.has(name) ? "tag critical" : "tag";
        tag.textContent = name;
        container.appendChild(tag);
      });
    }

    if (resp.critical === 0 && !resp.profile?.requiresLocalStorage) {
      showToast("No auth cookies found. Are you logged in?", "error");
      $("btnIncognito").disabled = true;
    } else if (!resp.profile?.requiresLocalStorage) {
      showToast(`Found ${resp.critical} auth cookies — ready to clone!`, "success", 2500);
      $("btnIncognito").disabled = false;
    }
  });
}

// ==================== ACTIONS ====================

function handleIncognitoClick() {
  setLoading("btnIncognito", "spinIncognito", "btnIncognitoText", true, "Open in Incognito");
  chrome.runtime.sendMessage({ action: "openIncognito" }, (resp) => {
    setLoading("btnIncognito", "spinIncognito", "btnIncognitoText", false, "Open in Incognito");
    $("loadingBar").style.width = "0%";
    if (chrome.runtime.lastError) { showToast("Error: " + chrome.runtime.lastError.message, "error"); return; }
    if (resp?.success) {
      showToast(`✓ ${resp.message}`, "success");
      setTimeout(refreshCookieStats, 1000);
    } else {
      showToast("❌ " + (resp?.message || "Unknown error"), "error", 5000);
    }
  });
}

function handleExportClick() {
  chrome.runtime.sendMessage({ action: "exportCookies" }, (resp) => {
    if (chrome.runtime.lastError || !resp?.success) {
      showToast("Export failed: " + (resp?.message || "Unknown error"), "error");
      return;
    }
    const json = JSON.stringify(resp.data, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      showToast(`✓ ${resp.count} cookies copied to clipboard as JSON`, "success");
    }).catch(() => {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      chrome.tabs.create({ url });
      showToast("✓ Opened cookie JSON in new tab", "info");
    });
  });
}

function handleCookieEditorExportClick() {
  showToast("Preparing Cookie-Editor export...", "info");
  chrome.runtime.sendMessage({ action: "exportForCookieEditor" }, (resp) => {
    if (chrome.runtime.lastError) { showToast("Error: " + chrome.runtime.lastError.message, "error"); return; }
    if (resp?.success) showToast(`✓ ${resp.message}`, "success", 5000);
    else showToast("❌ " + (resp?.message || "Export failed"), "error");
  });
}

// ==================== SESSIONS ====================

async function loadSavedSessions() {
  const sessionList = $("sessionList");
  if (!sessionList) return;

  chrome.runtime.sendMessage({ action: "listSessions" }, (resp) => {
    sessionList.innerHTML = "";

    if (chrome.runtime.lastError || !resp?.success) {
      const err = document.createElement("span");
      err.className = "tag";
      err.textContent = "failed to load";
      sessionList.appendChild(err);
      return;
    }

    if (resp.sessions.length === 0) {
      const empty = document.createElement("span");
      empty.className = "tag";
      empty.style.margin = "4px 0";
      empty.textContent = "No saved sessions yet";
      sessionList.appendChild(empty);
      return;
    }

    resp.sessions.forEach(session => {
      const item = document.createElement("div");
      item.className = "session-item";

      const info = document.createElement("div");
      info.className = "session-info";

      const nameEl = document.createElement("div");
      nameEl.className = "session-name";
      nameEl.textContent = session.name;

      const meta = document.createElement("div");
      meta.className = "session-meta";
      const siteProfile = allProfiles[session.platform];
      const siteLabel = siteProfile ? `${siteProfile.icon} ${siteProfile.name}` : session.platform;
      meta.textContent = `${siteLabel} · ${session.cookieCount} cookies · ${new Date(session.updatedAt).toLocaleDateString()}`;

      info.appendChild(nameEl);
      info.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "session-actions";

      [
        { action: "incognito", title: "Load in incognito", icon: "🕵️" },
        { action: "current",   title: "Load in current browser", icon: "📂" },
        { action: "rename",    title: "Rename", icon: "✏️" },
        { action: "delete",    title: "Delete", icon: "🗑️", cls: "delete" }
      ].forEach(({ action, title, icon, cls }) => {
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

function loadSessionIncognito(sessionId) {
  showToast("Loading session in incognito...", "info");
  chrome.runtime.sendMessage({ action: "loadSessionIncognito", sessionId }, (resp) => {
    if (chrome.runtime.lastError) { showToast("Error: " + chrome.runtime.lastError.message, "error"); return; }
    if (resp?.success) showToast(`✓ ${resp.message}`, "success");
    else showToast("❌ " + (resp?.message || "Failed to load session"), "error");
  });
}

function loadSessionCurrent(sessionId) {
  showToast("Loading cookies into current browser...", "info");
  chrome.runtime.sendMessage({ action: "loadSessionCurrent", sessionId }, (resp) => {
    if (chrome.runtime.lastError) { showToast("Error: " + chrome.runtime.lastError.message, "error"); return; }
    if (resp?.success) showToast(`✓ ${resp.message}`, "success");
    else showToast("❌ " + (resp?.message || "Failed to load session"), "error");
  });
}

function deleteSession(sessionId) {
  chrome.runtime.sendMessage({ action: "deleteSession", sessionId }, (resp) => {
    if (resp?.success) { showToast("Session deleted", "success"); loadSavedSessions(); }
    else showToast("Failed to delete session", "error");
  });
}

function promptRenameSession(sessionId, currentName) {
  const input = $("sessionNameInput");
  const wrap = $("sessionInputWrap");
  input.value = currentName;
  wrap.dataset.renameId = sessionId;
  wrap.style.display = "block";
  input.focus();
}

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

$("btnConfirmSave").addEventListener("click", () => {
  const input = $("sessionNameInput");
  const name = input.value.trim();
  if (!name) { showToast("Please enter a session name", "error"); return; }

  const renameId = $("sessionInputWrap").dataset.renameId;
  if (renameId) {
    chrome.runtime.sendMessage({ action: "renameSession", sessionId: renameId, newName: name }, (resp) => {
      if (resp?.success) { showToast("Session renamed", "success"); loadSavedSessions(); }
      else showToast("Failed to rename: " + (resp?.message || "Unknown error"), "error");
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
    if (chrome.runtime.lastError) { showToast("Error: " + chrome.runtime.lastError.message, "error"); return; }
    if (saveResp?.success) { showToast(`✓ Session "${name}" saved`, "success"); loadSavedSessions(); }
    else showToast("Failed to save session: " + (saveResp?.message || "Unknown error"), "error");
  });
}

$("btnImportSession").addEventListener("click", async () => {
  try {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      chrome.runtime.sendMessage({ action: "importSession", fileContent: text }, (resp) => {
        if (resp?.success) { showToast(`✓ Imported session "${resp.session.name}"`, "success"); loadSavedSessions(); }
        else showToast("Import failed: " + (resp?.message || "Unknown error"), "error");
      });
    };
    input.click();
  } catch (e) {
    showToast("Failed to open file picker", "error");
  }
});

// ==================== CUSTOM DOMAIN ====================

$("btnAddCustomDomain").addEventListener("click", () => {
  const wrap = $("customDomainWrap");
  wrap.style.display = wrap.style.display === "block" ? "none" : "block";
  if (wrap.style.display === "block") $("customDomainInput").focus();
});

$("btnConfirmCustomDomain").addEventListener("click", () => {
  const name = $("customDomainName").value.trim();
  const domain = $("customDomainInput").value.trim();
  if (!domain) { showToast("Please enter a domain", "error"); return; }
  const displayName = name || domain;
  chrome.runtime.sendMessage({ action: "addCustomDomain", name: displayName, domain }, (resp) => {
    if (resp?.success) {
      showToast(`✓ Added ${displayName}`, "success");
      $("customDomainWrap").style.display = "none";
      $("customDomainInput").value = "";
      $("customDomainName").value = "";
      // Reload profiles and re-render
      chrome.runtime.sendMessage({ action: "listProfiles" }, (r) => {
        if (r?.success) { allProfiles = r.profiles; renderSiteSelector(); }
      });
    } else {
      showToast("Failed: " + (resp?.message || "Unknown error"), "error");
    }
  });
});

$("btnCancelCustomDomain").addEventListener("click", () => {
  $("customDomainWrap").style.display = "none";
  $("customDomainInput").value = "";
  $("customDomainName").value = "";
});

// ==================== INIT ====================

document.addEventListener("DOMContentLoaded", () => {
  $("btnIncognito").addEventListener("click", handleIncognitoClick);
  $("btnExport").addEventListener("click", handleExportClick);
  $("btnExportCookieEditor").addEventListener("click", handleCookieEditorExportClick);
  initSaveSessionBtn();
  initSiteDetection();
  loadSavedSessions();
});
