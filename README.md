# 🧩 Session Export — Chrome Extension (Manifest V3)

[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

A high-performance Chrome Browser Extension designed to clone and transfer active authenticated browser sessions, cookies, and local states into Incognito mode across multiple domains.

---

## ✨ Features

- 🕵️ **Incognito Session Clone**: Instant session replication from regular window into an isolated incognito window.
- ⚡ **Multi-Site Cookie Transfer**: Preserves active auth tokens and state across designated site domains.
- 🚀 **Offscreen Document API**: Utilizes Manifest V3 offscreen documents for reliable background state processing.
- 🛡️ **Privacy & Local Storage**: Stores session configs locally using `chrome.storage.local` with zero external tracking.

---

## 📁 File Structure

```
session_export/
├── manifest.json         # Extension Manifest V3 metadata & permissions
├── background.js         # Service worker for event handling & session spawning
├── offscreen.js          # Offscreen document handler for DOM & cookie operations
├── popup.html / popup.js # User interface popup for session export trigger
├── storage.js            # Storage abstraction layer
├── sites.js              # Site domain rules & configuration
└── icons/                # Extension action branding icons
```

---

## 🛠️ Installation & Setup (Developer Mode)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Sathyabalan6/session_export.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle switch in the top-right corner).
4. Click **Load unpacked**.
5. Select the `session_export` directory.
6. Click the extension icon in your toolbar to clone active sessions!

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
