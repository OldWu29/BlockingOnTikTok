# Douyin One-Click Block (BlockingOnTikTok)

A browser extension for **Microsoft Edge**, **Chrome**, and other Chromium-based browsers. It lets you **block or unblock the author of the video currently playing** on [Douyin Web](https://www.douyin.com) (the Chinese version of TikTok) and manage your block list locally.

> This project is **not affiliated with Douyin or ByteDance**. It is an independent third-party tool built to improve the web browsing experience.

[中文文档](README.md)

---

## Features

| Feature | Description |
|---------|-------------|
| One-click block | Detects the author of the playing video and blocks them via Douyin's web API |
| One-click unblock | Quickly unblock authors you have previously blocked |
| Floating button | A floating action button on the Douyin page that updates based on block status |
| Extension popup | View the current author and block or unblock from the toolbar popup |
| Block list manager | View, search, and manage locally saved block records |
| Keyboard shortcuts | `Ctrl+Shift+B` to block, `Ctrl+Shift+U` to unblock |

---

## Use Cases

- You see an author you dislike in the feed and want to block them immediately
- You want to skip the official flow: profile → menu → block → confirm
- You need a central place to review, search, and unblock users

---

## Installation

### Option 1: Load unpacked (recommended)

1. Clone or download this repository
2. Open your browser's extension management page
   - Edge: `edge://extensions/`
   - Chrome: `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project root folder (the one containing `manifest.json`)
5. Open [https://www.douyin.com](https://www.douyin.com) and **sign in**

### Option 2: Package as ZIP (for distribution or store submission)

```powershell
.\scripts\package.ps1
```

The packaged file is written to the `dist/` directory by default.

---

## Usage

### 1. Block the current author

Use any of the following:

- Click the **Block author** floating button at the bottom-right of the page
- Click the extension icon in the toolbar, then click **Block current author** in the popup
- Press **`Ctrl + Shift + B`**

### 2. Unblock

If the current author is already blocked:

- The floating button changes to **Unblock**
- The popup shows a **Blocked** badge and an unblock button
- Press **`Ctrl + Shift + U`**

### 3. Block list management

Open the management page from:

- **Block list** in the top-right corner of the extension popup
- Extension details → **Extension options**

The management page supports:

- Search by nickname or `sec_uid`
- **Unblock** (calls the Douyin API and removes the local record)
- **Open profile** (opens the author's Douyin profile)
- **Remove record only** (deletes the local record without unblocking on Douyin)
- **Clear all** (clears the local block list)

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + Shift + B` | Block the current video author |
| `Ctrl + Shift + U` | Unblock the current video author |

You can customize shortcuts on the extension management page under **Keyboard shortcuts**.

---

## Project Structure

```
BlockingOnTikTok/
├── manifest.json              # Extension manifest (Manifest V3)
├── src/
│   ├── inject.js              # Injected page script; calls Douyin block API
│   ├── content.js             # Content script; author detection and UI
│   ├── background.js          # Service worker; keyboard shortcuts
│   ├── storage.js             # Local block list storage
│   ├── popup.html/js/css      # Extension popup
│   ├── blacklist.html/js/css  # Block list management page
│   └── styles.css             # Floating button styles
├── docs/                      # Privacy policy, store submission docs, etc.
├── scripts/
│   └── package.ps1            # Packaging script
├── README.md                  # Chinese documentation
└── README.en.md               # English documentation
```

---

## Technical Notes

### Author detection

The extension identifies the current video author through multiple strategies:

- The currently playing `video` element and its parent containers
- User profile links on the page (`/user/{sec_uid}`)
- Cached data from Douyin API responses (via `fetch` / `XHR` interception)

### How blocking works

- Calls the Douyin web endpoint: `/aweme/v1/web/user/block/`
- Injects a script into the page context to reuse Douyin's signing logic (e.g. `_byted_acrawler`)
- Requests include browser cookies — **you must be signed in to Douyin Web**

### Data storage

- The block list is stored locally in `chrome.storage.local`
- **No data is uploaded to any developer-operated server**
- See the [privacy policy](docs/privacy-policy.zh-CN.md) (Chinese) for details

---

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save the local block list |
| `activeTab` | Communicate with the active Douyin tab |
| `tabs` | Find or open a Douyin tab when unblocking from the block list page |
| `douyin.com` / `www-hj.douyin.com` | Inject scripts and call the block API on Douyin pages |

---

## FAQ

**Q: It says "Author not detected"?**  
A: Make sure a video is playing, click **Refresh author info** in the popup, or reload the Douyin page and try again.

**Q: Block failed / 403?**  
A: Confirm you are signed in to Douyin Web. If it still fails, reload the page so Douyin's signing scripts can reinitialize.

**Q: What is the difference between "Remove record only" and "Unblock"?**  
A: "Remove record only" deletes the entry from the extension's local list. "Unblock" actually calls the Douyin API to remove the block.

**Q: Keyboard shortcuts don't work?**  
A: Chromium extension shortcuts must include `Ctrl` or `Alt`; `Shift` alone is not valid. Rebind them on the extension management page.

---

## Disclaimer

- This extension is provided for learning and personal use
- Use blocking responsibly; frequent automated actions may trigger platform rate limits
- The developer is not responsible for account restrictions, API changes, or other issues arising from use of this extension
- Douyin trademarks and products belong to ByteDance

---

## Links

- Repository: [https://github.com/OldWu29/BlockingOnTikTok](https://github.com/OldWu29/BlockingOnTikTok)
- Privacy policy: [docs/privacy-policy.zh-CN.md](docs/privacy-policy.zh-CN.md) (Chinese)

---

## Changelog

### v1.1.0

- Added unblock support
- Added block list management page
- Added `Ctrl+Shift+U` shortcut
- Floating button now toggles between block and unblock states

### v1.0.0

- Initial release: one-click block for the current video author
