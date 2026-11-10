# controlTab: what to enter in the Chrome Web Store dashboard

Everything needed to publish or update the extension on the Chrome Web Store: the images in this
folder, and the text for each field below. Field names may differ slightly in the French
dashboard.

## The package to upload

The store wants a zip of the extension's own files, without the documentation or this folder.
Build it from the repository root:

```bash
zip -r controlTab.zip manifest.json background.js switcher.js options.html options.js icons
```

Upload it with "New item" the first time, or under "Package" for an update. Raise `version` in
`manifest.json` before every update: the store refuses a version it has already seen. The name and
short summary shown in the store come from the package.

---

## Tab "Store listing"

**Description**

```
controlTab makes Ctrl+Tab switch between the tabs you used most recently, instead of moving to the next tab in the tab strip. The visual switcher is inspired by the one in the Arc browser.

TWO MODES
• Switcher: hold Ctrl and tap Tab to move through your recent tabs, shown with previews. Release Ctrl to switch. A quick tap jumps straight to the last tab.
• Direct: each press jumps to the last tab you used, with no visual. Keep Ctrl held and tap Tab again to go further back.

Ctrl+Shift+Tab moves the other way in both modes.

THE RECENT LIST
• It starts empty every time the browser starts and fills up as you visit tabs.
• While the switcher is open, Delete removes the highlighted tab from the list. A setting makes it close the tab instead.
• Cmd+Delete empties the list.

ONE-TIME SETUP
Chrome does not let an extension take Ctrl+Tab by itself. After installing, the settings page opens and shows a short command to paste once on the browser's shortcuts page. Any other shortcut can be set the usual way on that page.

PRIVACY
To draw the switcher, controlTab reads the title, address and icon of the tabs you visit, and keeps a small preview image of each. All of it stays in your browser's memory until the browser closes. Nothing is sent anywhere: the extension makes no network requests and has no server.

Open source: https://github.com/lth-elm/controlTab
```

**Category:** Functionality & UI (if that name is not offered, pick the closest one about tabs or
productivity tools).

**Language:** English.

**Store icon (required):** upload `store-icon-128.png`.

**Screenshots (at least one required):** upload `screenshot-1280x800.png`, then
`screenshot-2-settings-1280x800.png` if you want a second one.

**Small promo tile (optional):** `promo-small-440x280.png`.

**Marquee promo tile (optional):** `promo-marquee-1400x560.png`. It is only used if the store
features the extension, so it does nothing for an unlisted item.

**Promo video (optional):** leave empty.

**Homepage URL**

```
https://github.com/lth-elm/controlTab
```

**Support URL**

```
https://github.com/lth-elm/controlTab/issues
```

**Mature content:** No.

---

## Tab "Privacy practices"

**Single purpose**

```
controlTab changes what the tab-switching shortcut does: instead of going to the next tab in the tab strip, Ctrl+Tab goes to the tabs the user viewed most recently, optionally through a visual switcher that shows those tabs.
```

**Justification for "tabs"**

```
Used to read the title and address of the tabs the user viewed recently. The title is shown in the switcher and the address is used to look up the tab's icon. Without this permission, tabs showing browser pages would appear in the switcher with no title.
```

**Justification for "storage"**

```
Saves the user's two settings (switcher or direct mode, and what the Delete key does). Also keeps the list of recently used tabs and their preview images in session storage, which is cleared when the browser closes.
```

**Justification for "scripting"**

```
Used only when the extension is installed or updated, to add the switcher's own packaged script (switcher.js) to tabs that are already open, so the shortcut works in them without a reload. No other code is injected.
```

**Justification for "favicon"**

```
Shows each tab's icon next to its title in the switcher. Icons are read from the browser's local favicon cache.
```

**Justification for host permissions (all sites)**

```
The switcher is drawn on top of whatever page the user is viewing when the shortcut is pressed, and the tab switch happens when the modifier key is released, which only a script running in that page can detect. The content script therefore has to be present on every page. The same access is required by chrome.tabs.captureVisibleTab, used to take the small preview image of a tab shown in the switcher. Nothing else is read from pages, and nothing is transmitted.
```

**Are you using remote code?** No.

**Data usage: which data does the item handle?** Tick these two, leave the rest unticked:

- **Web history** (the titles and addresses of recently viewed tabs)
- **Website content** (the preview images)

Both are handled on the device only. The store's rules ask for them to be declared even when
nothing leaves the device.

**Certifications:** tick all three (data is not sold or transferred to third parties, not used for
unrelated purposes, not used for creditworthiness or lending).

**Privacy policy URL**

```
https://github.com/lth-elm/controlTab/blob/main/PRIVACY.md
```

---

## Tab "Distribution"

- **Payments:** Free.
- **Visibility:** Unlisted (only people with the link can find and install it).
- **Regions:** All regions.

---

## Tab "Test instructions" (notes for the reviewer)

No account or login is needed. Paste this so the reviewer knows how to trigger the extension:

```
The extension has no default shortcut, because Chrome reserves Ctrl+Tab. To test it:
1. Open chrome://extensions/shortcuts and assign any shortcut, for example Alt+Q, to "Switch to the most recently used tab (Ctrl+Tab)".
2. Open three or four ordinary web pages in tabs and click each tab once, so that they count as recently used.
3. Hold Alt and press Q: the switcher appears. Press Q again to move, release Alt to switch.
The settings page (toolbar icon) explains how to bind Ctrl+Tab itself, and lets you choose the direct mode.
```

---

## Account settings you may be asked for

- A publisher name and a verified contact email.
- A trader or non-trader declaration (an individual sharing a free extension is a non-trader).
- 2-step verification on the Google account.
