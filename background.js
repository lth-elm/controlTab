// controlTab service worker: remembers which tabs were used in this browser
// session, keeps small previews of them, and reacts to the keyboard shortcut.

const MAX_TABS = 10; // tabs offered by the switcher
const KEEP_PREVIEWS = 50; // previews kept, counted by recency
const PREVIEW_W = 400;
const PREVIEW_H = 225;
const PAGE_REPLY_MS = 300; // how long a page gets to answer before we stop waiting
const WALK_MS = 2000; // direct mode: slower presses than this start over from the top

let mru = []; // ids of the tabs used in this session, most recent first
let walk = null; // direct mode: the list being walked while the keys stay down
let presses = Promise.resolve(); // shortcut presses are handled one at a time

const previewKey = (tabId) => `preview:${tabId}`;

// Forgets the recent tabs. Only the tab in view in each window stays known, so
// the switcher is empty until other tabs get used.
async function forgetRecents() {
  const previous = mru;
  mru = (await chrome.tabs.query({ active: true })).map((tab) => tab.id);
  walk = null;
  await chrome.storage.session.remove(previous.filter((id) => !mru.includes(id)).map(previewKey));
  await chrome.storage.session.set({ mru });
}

// Session storage is wiped when the browser restarts: every session starts empty.
const ready = chrome.storage.session.get('mru').then((data) => {
  if (!data.mru) return forgetRecents();
  mru = data.mru;
});

// Wake up when the browser starts, so the tab in view is known before it is left.
chrome.runtime.onStartup.addListener(() => {});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await ready;
  // Only a tab that is still in view counts. While the browser restores a
  // session it selects the first tab of each window for an instant, and those
  // events reach us late, once the real tab is already showing.
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.active) return;
  mru = [tabId, ...mru.filter((id) => id !== tabId)];
  // The tab that just fell out of the recent set loses its preview.
  const dropped = mru[KEEP_PREVIEWS];
  if (dropped !== undefined) chrome.storage.session.remove(previewKey(dropped));
  chrome.storage.session.set({ mru });
});

// Drops one tab from the recent list.
function forgetTab(tabId) {
  mru = mru.filter((id) => id !== tabId);
  walk = null;
  chrome.storage.session.remove(previewKey(tabId));
  chrome.storage.session.set({ mru });
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ready;
  forgetTab(tabId);
});

// The tabs of a window that were used in this session: the current one first,
// then the others by how recently they were used.
async function recentTabs(windowId) {
  await ready;
  const tabs = await chrome.tabs.query({ windowId });
  const rank = (tab) => (tab.active ? -1 : mru.indexOf(tab.id));
  return tabs
    .filter((tab) => tab.active || mru.includes(tab.id))
    .sort((a, b) => rank(a) - rank(b));
}

function activate(tabId) {
  chrome.tabs.update(tabId, { active: true }).catch(() => {});
}

// Closes a tab picked in the switcher shown by the tab `from`.
async function closeTab(tabId, from) {
  if (tabId === from.id) {
    // Closing the tab in view: land on the last used tab, not on a neighbour.
    const [, next] = await recentTabs(from.windowId);
    if (next) await chrome.tabs.update(next.id, { active: true }).catch(() => {});
  }
  chrome.tabs.remove(tabId).catch(() => {});
}

// Sends a question to the page in a tab. Resolves to false when the page cannot
// answer (browser page, busy page).
function askPage(tabId, message) {
  const reply = chrome.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => false);
  const timeout = new Promise((resolve) => setTimeout(resolve, PAGE_REPLY_MS, false));
  return Promise.race([reply, timeout]);
}

// Switches without the switcher. A fresh press goes to the last used tab; more
// presses while the keys stay down walk further through the list.
async function switchDirectly(tab, dir) {
  const now = Date.now();
  const continuing =
    walk?.current === tab.id &&
    now - walk.at < WALK_MS &&
    (await askPage(tab.id, { type: 'held' }));
  if (!continuing) {
    walk = { ids: (await recentTabs(tab.windowId)).map((t) => t.id), index: 0 };
  }
  const { ids } = walk;
  if (ids.length < 2) return;
  walk.index = (walk.index + dir + ids.length) % ids.length;
  walk.current = ids[walk.index];
  walk.at = now;
  // Only the tab we land on counts as used: tabs passed on the way keep their place.
  mru = [
    walk.current,
    ...ids.filter((id) => id !== walk.current),
    ...mru.filter((id) => !ids.includes(id)),
  ];
  chrome.storage.session.set({ mru });
  await chrome.tabs.update(walk.current, { active: true }).catch(() => {});
}

async function onCommand(command, tab, pressedAt = Date.now()) {
  const dir = command === 'backward' ? -1 : 1;
  // Earlier presses may have changed the tab since this one was queued.
  const where = tab ? { windowId: tab.windowId } : { lastFocusedWindow: true };
  [tab] = await chrome.tabs.query({ active: true, ...where });
  if (!tab) return;

  // The page shows the switcher. If it cannot (browser page, address bar
  // focused, keys already released), we switch directly instead.
  const { mode } = await chrome.storage.sync.get({ mode: 'visual' });
  if (mode === 'visual' && (await askPage(tab.id, { type: 'step', dir, pressedAt }))) return;
  await switchDirectly(tab, dir);
}

chrome.commands.onCommand.addListener((command, tab) => {
  const pressedAt = Date.now();
  presses = presses.then(() => onCommand(command, tab, pressedAt)).catch(() => {});
});

const toDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// Favicons come from Chrome's own cache, so the switcher loads nothing from the network.
async function favicon(pageUrl) {
  try {
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', '32');
    return await toDataUrl(await (await fetch(url)).blob());
  } catch {
    return '';
  }
}

// Everything the page needs to draw the switcher.
async function describeSwitcher(windowId) {
  const [{ remove }, recent] = await Promise.all([
    chrome.storage.sync.get({ remove: 'forget' }),
    recentTabs(windowId),
  ]);
  const tabs = recent.slice(0, MAX_TABS);
  const previews = await chrome.storage.session.get(tabs.map((tab) => previewKey(tab.id)));
  return {
    closes: remove === 'close', // does Delete close the tab, or only take it off the list?
    tabs: await Promise.all(
      tabs.map(async (tab) => ({
        id: tab.id,
        title: tab.title || tab.url || '',
        icon: await favicon(tab.url || tab.pendingUrl || ''),
        preview: previews[previewKey(tab.id)] ?? '',
      })),
    ),
  };
}

async function capturePreview(tab) {
  try {
    const stillCurrent = async () => (await chrome.tabs.get(tab.id)).active;
    if (!(await stillCurrent())) return;
    const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 60 });
    const bitmap = await createImageBitmap(await (await fetch(shot)).blob());
    if (!(await stillCurrent())) return;

    // Scale down to preview size, keeping the top of the page.
    const scale = Math.max(PREVIEW_W / bitmap.width, PREVIEW_H / bitmap.height);
    const srcW = PREVIEW_W / scale;
    const srcH = PREVIEW_H / scale;
    const canvas = new OffscreenCanvas(PREVIEW_W, PREVIEW_H);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, (bitmap.width - srcW) / 2, 0, srcW, srcH, 0, 0, PREVIEW_W, PREVIEW_H);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    await chrome.storage.session.set({ [previewKey(tab.id)]: await toDataUrl(blob) });
  } catch {
    // Not capturable right now (browser page, minimized window, rate limit).
  }
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === 'clear') {
    // Sent by the switcher (Cmd+Delete, Clear button) and by the settings page.
    ready.then(forgetRecents).then(
      () => respond(true),
      () => respond(false),
    );
    return true; // respond asynchronously
  }
  const tab = sender.tab;
  if (!tab) return;
  if (msg.type === 'list') {
    describeSwitcher(tab.windowId).then(respond, () => respond(null));
    return true; // respond asynchronously
  }
  if (msg.type === 'activate') activate(msg.tabId);
  if (msg.type === 'close') closeTab(msg.tabId, tab);
  if (msg.type === 'forget') ready.then(() => forgetTab(msg.tabId));
  if (msg.type === 'preview') capturePreview(tab);
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // Tabs that were already open only get the switcher if we add it ourselves.
  for (const tab of await chrome.tabs.query({})) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ['switcher.js'] })
      .catch(() => {});
  }
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
