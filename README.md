# Session Cloner

A Chrome extension that clones your browser session into an incognito window — useful for managing multiple accounts without logging out. Supports 7 built-in sites and custom domains.

![Manifest Version](https://img.shields.io/badge/Manifest-V3-blue)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-yellow)
![Version](https://img.shields.io/badge/Version-2.0.0-brightgreen)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

- 🌐 **Multi-Site Support** — Built-in profiles for Twitter/X, Reddit, GitHub, Instagram, LinkedIn, Google, and custom domains
- 🕵️ **Clone to Incognito** — Copy your current session cookies into a fresh incognito window instantly
- 💾 **Save Sessions** — Save named snapshots of your session cookies for later use
- 📂 **Load Sessions** — Restore a saved session into incognito or your current browser
- 📋 **Export Cookies** — Export cookies as JSON to clipboard (standard or Cookie-Editor format)
- 📥 **Import Sessions** — Import a previously exported session from a `.json` file
- 🔍 **Auto-Detect Site** — Automatically detects which supported site you're on when you open the popup
- ➕ **Custom Domains** — Add any site not in the built-in list
- 🗑️ **Delete Sessions** — Remove saved sessions you no longer need
- ✏️ **Rename Sessions** — Rename any saved session inline

---

## Screenshots

> _Add screenshots of your popup UI here_

---

## Installation

Since this extension is not on the Chrome Web Store, install it manually in developer mode.

### Steps

1. Clone or download this repository
   ```bash
   git clone https://github.com/<your-username>/twitter-cookie-extension.git
   ```

2. Open Chrome and go to `chrome://extensions`

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the `twitter-cookie-extension` folder

5. The extension icon will appear in your toolbar — pin it for easy access

---

## Usage

### Clone Session to Incognito
1. Log in to any supported site
2. Click the extension icon — it auto-detects the active site
3. Click **Open in Incognito**

### Save a Session
1. Click the extension icon
2. Click **Save Current** and enter a name
3. Click **Save Session**

### Load a Saved Session
- Click 🕵️ next to a session to load it in incognito
- Click 📂 to load it into your current browser

### Export / Import
- Click **Export Cookies (JSON)** to copy cookies to clipboard
- Click **Export for Cookie-Editor** to copy in Cookie-Editor compatible format (for cross-browser transfer)
- Click **Import** to load a session from a `.json` file

### Custom Domains
1. Select **Custom** from the site selector
2. Enter a name and domain
3. Click **Add** — the extension will request permission for that domain

### Context Menu
Right-click any page on a supported site and select **Clone Session in Incognito**

---

## Supported Sites

| Site | Auto-Detect | Cookie Cloning | Notes |
|---|---|---|---|
| Twitter / X | ✅ | ✅ | |
| Reddit | ✅ | ✅ | |
| GitHub | ✅ | ✅ | |
| Instagram | ✅ | ✅ | |
| LinkedIn | ✅ | ✅ | |
| Google | ✅ | ⚠️ | DBSC may limit effectiveness |
| Discord | ✅ | ❌ | Auth stored in localStorage, not cookies |
| Custom | Manual | ✅ | Any domain you add |

---

## Permissions

| Permission | Reason |
|---|---|
| `cookies` | Read and write session cookies |
| `tabs` | Detect active tab URL for site auto-detection |
| `windows` | Create incognito windows |
| `storage` | Save sessions and custom domains locally |
| `scripting` | Extension scripting support |
| `contextMenus` | Right-click context menu on supported sites |
| `offscreen` | Clipboard access from service worker (MV3 requirement) |

**Host permissions** — Twitter/X are granted at install time. All other sites use `optional_host_permissions` and are requested only when you select that site, minimizing install-time permission warnings.

> ⚠️ All cookies are stored **locally** in your browser via `chrome.storage.local`. Nothing is sent to any server.

---

## Project Structure

```
twitter-cookie-extension/
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── tests/
│   └── background.test.js   # 40 unit tests (zero dependencies)
├── background.js             # Service worker — cookie logic, session management
├── popup.html                # Extension popup UI
├── popup.js                  # Popup interaction logic
├── manifest.json             # Chrome extension manifest (MV3)
├── sites.js                  # Built-in site profiles
├── storage.js                # Storage utilities + custom domain management
├── offscreen.html            # Hidden document for clipboard API (MV3 workaround)
├── generate_icons.py         # Script to regenerate placeholder icons
└── README.md
```

---

## Running Tests

```bash
node tests/background.test.js
```

Zero dependencies — runs with plain Node.js. 40 tests covering cookie normalization, session validation, site detection, and custom domain validation.

---

## Generating Icons

```bash
python generate_icons.py
```

Creates `icon16.png`, `icon48.png`, and `icon128.png` in the `icons/` folder.

---

## Security Notes

- Cookies are **never transmitted** outside your browser
- Sessions are stored in `chrome.storage.local` — local to your browser profile only
- Non-Twitter sites use optional permissions — only requested when needed
- All user input (session names, custom domains) is validated and sanitized before use

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

[MIT](LICENSE) — feel free to use, modify, and distribute.
