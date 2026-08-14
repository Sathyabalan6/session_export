# Session Cloner — Project Overview

> Feed this file to any AI to get full context on the project.

---

## What It Is

A Chrome Extension (Manifest V3) that clones browser session cookies into an incognito window or exports them for cross-browser transfer. Originally built for Twitter/X, expanded to support 7 built-in sites and custom domains.

**Version**: 2.0.0  
**Manifest**: V3  
**Tests**: 40 unit tests, zero dependencies, `node tests/background.test.js`

---

## File Map

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest. Twitter/X in `host_permissions`. All other sites in `optional_host_permissions`. Permissions: cookies, tabs, windows, scripting, storage, contextMenus, offscreen. |
| `background.js` | Service worker. All cookie/session logic lives here. Uses `importScripts("storage.js", "sites.js")`. |
| `sites.js` | Defines `BUILTIN_SITES` — 7 built-in site profiles (twitter, reddit, github, instagram, linkedin, google, discord). |
| `storage.js` | `chrome.storage.local` wrappers. Session CRUD + custom domain CRUD. |
| `popup.html` | Extension popup UI. 360px wide. Sections: site selector chips, active site display, permission banner, session actions, saved sessions list, custom domain inputs. |
| `popup.js` | Popup logic. Auto-detects active tab site on open. Handles all UI interactions via messages to background.js. |
| `offscreen.html` | Hidden document used to call `navigator.clipboard.writeText()` from the service worker (MV3 has no DOM in service workers). |
| `tests/background.test.js` | 40 tests. Covers: `normalizeCookieForCookieEditor` (13), `validateSessionName` (7), `detectSiteFromUrl` (14), `validateCustomDomain` (6). All passing. |

---

## Architecture

```
popup.js  ──(chrome.runtime.sendMessage)──►  background.js
                                                  │
                                    ┌─────────────┼─────────────┐
                                 storage.js    sites.js    chrome APIs
                                                  │
                                            offscreen.html
                                          (clipboard only)
```

All actions flow as messages from popup → background. Background handles all chrome API calls and responds with `{ success, data, error }`.

---

## Message Actions (popup → background)

| Action | Description |
|---|---|
| `detectSite` | Returns site profile matching the active tab URL |
| `setSite` | Sets the active site for subsequent operations |
| `listProfiles` | Returns all built-in + custom site profiles |
| `requestPermission` | Requests optional host permission for a site's domains |
| `cloneToIncognito` | Clones current site's cookies into a new incognito window |
| `saveSession` | Saves named cookie snapshot for current site |
| `loadSession` | Restores a saved session (incognito or current window) |
| `deleteSession` | Removes a saved session by name |
| `renameSession` | Renames a saved session |
| `getSessions` | Returns all saved sessions (optionally filtered by site) |
| `exportCookies` | Copies cookies as JSON to clipboard |
| `exportForCookieEditor` | Copies cookies in Cookie-Editor format to clipboard |
| `importSession` | Imports cookies from a JSON string |
| `addCustomDomain` | Adds a custom site profile to storage |
| `removeCustomDomain` | Removes a custom site profile |

---

## Built-in Site Profiles (`sites.js`)

```
twitter   — auth_token, ct0, twid, kdt, lang, guest_id, ...
reddit    — reddit_session, token_v2, csrf_token, loid, edgebucket, session_tracker
github    — user_session, dotcom_user, _gh_sess, _device_id
instagram — sessionid, ds_user_id, csrftoken, mid, ig_did, datr
linkedin  — li_at, JSESSIONID, liap, li_a
google    — SID, HSID, SSID, OSID, SAPISID, APISID, __Secure-1PSID, __Secure-3PSID, __Secure-OSID
discord   — (no cookies — requiresLocalStorage: true, cloning blocked with error)
```

Each profile has: `id`, `name`, `icon`, `domains[]`, `criticalCookies[]`, `loginUrl`, optional `requiresLocalStorage`, optional `note`.

---

## Storage Schema (`chrome.storage.local`)

```js
// Saved sessions
"sessions": [
  {
    name: string,
    siteId: string,
    cookies: Cookie[],
    savedAt: number  // Date.now()
  }
]

// Custom domains
"customDomains": [
  {
    id: string,          // generated from name
    name: string,
    domains: string[],   // [domain, ".domain"] variants
    criticalCookies: string[],
    loginUrl: string
  }
]

// Active site
"activeSite": string  // site id
```

---

## Key Technical Decisions

### MV3 Clipboard Workaround
Service workers have no DOM access. `navigator.clipboard.writeText()` is called from `offscreen.html` via `chrome.runtime.sendMessage({ action: "writeClipboard", text })`. Background creates the offscreen document via `chrome.offscreen.createDocument()` before sending the message.

### Permission Strategy
- Twitter/X: declared in `host_permissions` — granted at install time (already the trusted core use case)
- All other sites: declared in `optional_host_permissions` — requested at runtime via `chrome.permissions.request()` triggered by user selecting a site
- This minimizes install-time permission warnings and Chrome Web Store scrutiny

### Cookie-Editor Export Format
`normalizeCookieForCookieEditor()` maps Chrome's cookie format to Cookie-Editor's expected schema:
- `sameSite`: Chrome uses `"no_restriction"/"lax"/"strict"/"unspecified"` → Cookie-Editor requires `"no_restriction"/"lax"/"strict"` (never `"None"` or capitalized)
- `storeId`: always set to `null`
- `session` and `expirationDate` are mutually exclusive — if `session: true`, omit `expirationDate`
- This was the primary cause of cross-browser import failures (Cookie-Editor issues #19, #242)

### Discord Exception
Discord stores auth in `localStorage` under key `token`, not in cookies. The extension detects this profile and shows a user-facing error instead of attempting a cookie clone.

### Google DBSC Warning
Google is rolling out Device Bound Session Credentials (DBSC) which binds sessions to the device. Cookie cloning may have limited effectiveness. Shown as a `note` in the profile and surfaced in the UI.

### Input Sanitization
All user input (session names, custom domains) is validated with `validateSessionName()` and `validateCustomDomain()` before use. DOM manipulation uses the DOM API (never `innerHTML`) to prevent XSS (CWE-94).

---

## Known Limitations

- Discord: localStorage-based auth — cookie cloning not possible
- Google: DBSC may invalidate cloned sessions
- CHIPS/partitioned cookies: Chrome's partitioned cookies (`__Host-` prefix) are not transferable across contexts
- Cross-browser transfer requires Cookie-Editor extension on the target browser

---

## What's Been Fixed / Improved (history)

1. CWE-94 — replaced all `innerHTML` with DOM API
2. `storage.js` was dead code — now wired via `importScripts` and extended
3. Duplicate `CRITICAL_COOKIES` constant removed — now lives in `sites.js`
4. Context menu self-message bug fixed
5. Incognito store detection fixed
6. Duplicate `DOMContentLoaded` listener removed
7. Triple-chained messages in `saveCurrentSessionFromPopup` collapsed
8. `confirm()` dialog replaced with inline UI confirmation
9. `generate_icons.py` issues fixed
10. Cookie-Editor export normalization implemented
11. Multi-site expansion with auto-detection and dynamic permissions
12. 40 unit tests added

---

## Running Locally

1. Load unpacked in `chrome://extensions` (Developer mode on)
2. Pin the extension
3. Navigate to any supported site and click the icon

```bash
# Run tests
node tests/background.test.js
```
