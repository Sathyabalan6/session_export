# 𝕏 Twitter Session Cloner

A Chrome extension that lets you clone your Twitter/X session into an incognito window — useful for managing multiple accounts without logging out.

![Manifest Version](https://img.shields.io/badge/Manifest-V3-blue)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-yellow)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

- 🕵️ **Clone to Incognito** — Copy your current Twitter/X session cookies into a fresh incognito window instantly
- 💾 **Save Sessions** — Save named snapshots of your session cookies for later use
- 📂 **Load Sessions** — Restore a saved session into incognito or your current browser
- 📋 **Export Cookies** — Export all Twitter/X cookies as JSON to clipboard
- 📥 **Import Sessions** — Import a previously exported session from a `.json` file
- 🗑️ **Delete Sessions** — Remove saved sessions you no longer need

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
1. Log in to [twitter.com](https://twitter.com) or [x.com](https://x.com)
2. Click the extension icon
3. Click **Open in Incognito** — a new incognito window will open with your session loaded

### Save a Session
1. Click the extension icon
2. Click **Save Current** and enter a name
3. Click **Save Session** to store it

### Load a Saved Session
- Click 🕵️ next to a session to load it in a new incognito window
- Click 📂 to load it into your current browser

### Export / Import
- Click **Export Cookies (JSON)** to copy cookies to clipboard
- Click **Import** to load a session from a `.json` file

### Context Menu
Right-click any page on `twitter.com` or `x.com` and select **Clone Twitter Session in Incognito**

---

## Permissions

| Permission | Reason |
|---|---|
| `cookies` | Read and write Twitter/X session cookies |
| `tabs` | Navigate the incognito tab after opening |
| `windows` | Create incognito windows |
| `storage` | Save sessions locally in the browser |
| `scripting` | Extension scripting support |
| `contextMenus` | Right-click context menu on Twitter/X pages |

> ⚠️ All cookies are stored **locally** in your browser via `chrome.storage.local`. Nothing is sent to any server.

---

## Project Structure

```
twitter-cookie-extension/
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── background.js       # Service worker — cookie logic, session management
├── popup.html          # Extension popup UI
├── popup.js            # Popup interaction logic
├── manifest.json       # Chrome extension manifest (MV3)
├── generate_icons.py   # Script to regenerate placeholder icons
└── storage.js          # Storage utilities
```

---

## Generating Icons

If you want to regenerate the placeholder icons:

```bash
python generate_icons.py
```

This creates `icon16.png`, `icon48.png`, and `icon128.png` in the `icons/` folder.

---

## Security Notes

- Cookies are **never transmitted** outside your browser
- Sessions are stored in `chrome.storage.local` — local to your browser profile only
- The extension only has host permissions for `twitter.com` and `x.com`

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
