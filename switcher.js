// controlTab switcher: runs in every page. It draws the tab switcher when the
// background asks for it, and switches tabs when the shortcut's modifier keys
// (Ctrl, Alt or Cmd) are released.
(() => {
  if (globalThis.controlTabLoaded) return;
  globalThis.controlTabLoaded = true;

  const REVEAL_MS = 150; // a quick tap switches tabs without flashing the switcher

  let held = null; // are the modifier keys down? null when we cannot know
  let fresh = false; // did a modifier key go down or up since this page got the keyboard?
  let ui = null; // the open switcher, if any
  let sheet = null;
  let previewTimer = 0;

  const FRAMES = 'iframe, frame, embed, object';
  const MAC = /Mac/.test(navigator.platform);
  const hasModifier = (e) => e.ctrlKey || e.altKey || e.metaKey;
  const isModifierKey = (e) => e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta';
  const wrap = (i, n) => ((i % n) + n) % n;

  // After the extension is reloaded, this copy of the script is cut off from it.
  const send = (msg) =>
    chrome.runtime?.id ? chrome.runtime.sendMessage(msg).catch(() => {}) : Promise.resolve();

  addEventListener(
    'keydown',
    (e) => {
      if (!e.isTrusted) return;
      held = hasModifier(e);
      if (isModifierKey(e) && !e.repeat) fresh = true;
      if (!ui) return;
      // Delete takes the highlighted tab off the list (or closes it, by setting),
      // Cmd+Delete empties the list. Both only act once the switcher is on screen.
      const deleting = ui.host && (e.key === 'Delete' || e.key === 'Backspace');
      if (deleting || e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!deleting) close();
        else if (e.repeat) return; // a held key must not close one tab after another
        else if (e.metaKey) clear();
        else drop(wrap(ui.index, ui.tabs.length));
      } else if (!held) {
        commit();
      }
    },
    true,
  );

  addEventListener(
    'keyup',
    (e) => {
      if (!e.isTrusted) return;
      held = hasModifier(e);
      if (isModifierKey(e)) fresh = true;
      if (ui && !held) commit();
    },
    true,
  );

  // Focus left the page (other app, address bar, a frame): keys stop reaching us.
  addEventListener('blur', () => {
    held = null;
    fresh = false;
    close();
  });

  // If a key release was missed, the next mouse move reveals that the keys are up.
  function onMouseMove(e) {
    if (!e.isTrusted) return;
    held = hasModifier(e);
    if (!held) commit();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.type === 'step') respond(step(msg));
    if (msg.type === 'held') respond(stillHeld());
  });

  // Direct mode asks this after it brought this tab to the front: are the keys
  // that started the walk still down? Only if this page had the keyboard the
  // whole time and saw no modifier key move.
  function stillHeld() {
    return !fresh && document.hasFocus() && !document.activeElement?.matches(FRAMES);
  }

  // Runs on every press of the shortcut. Returns false when the switcher cannot
  // work here, and the background then switches tabs directly.
  function step({ dir, pressedAt }) {
    if (ui) {
      ui.index += dir;
      paint();
      return true;
    }
    // Keys already released, or a page that will never see them released.
    if (held === false || !document.hasFocus()) return false;
    open(dir, pressedAt);
    return true;
  }

  async function open(dir, pressedAt) {
    const session = { index: dir, tabs: null, released: false, timer: 0, refocus: [] };
    ui = session;

    // Keys typed inside a frame never reach this document, so borrow the focus
    // and remember where it was. Same-origin frames let us see the real target.
    const frame = document.activeElement;
    if (frame?.matches(FRAMES)) {
      let target = frame;
      while (target.contentDocument?.activeElement) target = target.contentDocument.activeElement;
      session.refocus = [frame, target];
      frame.blur();
    }
    addEventListener('mousemove', onMouseMove, true);

    const list = await send({ type: 'list' });
    if (ui !== session) return;
    if (!list?.tabs.length) return close();
    session.tabs = list.tabs;
    session.closes = list.closes;
    if (session.released) return commit();
    session.timer = setTimeout(reveal, Math.max(0, pressedAt + REVEAL_MS - Date.now()));
  }

  function commit() {
    if (!ui.tabs) {
      ui.released = true; // the tab list is still loading, open() finishes the job
      return;
    }
    const tab = ui.tabs[wrap(ui.index, ui.tabs.length)];
    close();
    send({ type: 'activate', tabId: tab.id });
  }

  function close() {
    if (!ui) return;
    const { timer, host, refocus } = ui;
    ui = null;
    clearTimeout(timer);
    removeEventListener('mousemove', onMouseMove, true);
    host?.remove();
    for (const node of refocus) node.focus({ preventScroll: true });
    queuePreview();
  }

  function element(tag, className) {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  }

  function image(src, className) {
    const img = element('img', className);
    img.alt = '';
    img.draggable = false;
    if (src) img.src = src;
    return img;
  }

  function reveal() {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'closed' });
    root.adoptedStyleSheets = [styles()];

    const box = root.appendChild(element('div', 'box'));
    const panel = box.appendChild(element('div', 'panel'));
    const hint = box.appendChild(element('div', 'hint'));

    // Pick on press, switch on release. On a Mac, Ctrl+click is a right click.
    panel.addEventListener('pointerup', commit);
    // A pointer that just happens to rest under the switcher should not highlight a card.
    panel.addEventListener('pointermove', () => panel.classList.add('pointing'), { once: true });
    hint.addEventListener('pointerdown', (e) => e.preventDefault());
    box.addEventListener('contextmenu', (e) => e.preventDefault());

    document.documentElement.append(host);
    try {
      // The top layer keeps the switcher above everything, fullscreen video included.
      host.popover = 'manual';
      host.showPopover();
    } catch {}

    Object.assign(ui, { host, panel, hint });
    render();
  }

  // Fills the switcher with the tabs in ui.tabs.
  function render() {
    const { panel, hint, tabs } = ui;
    ui.glow = element('div', 'glow');
    ui.cards = tabs.map((tab, i) => {
      const card = element('div', 'card');
      const shot = card.appendChild(element('div', 'shot'));
      shot.append(tab.preview ? image(tab.preview, 'preview') : image(tab.icon, 'placeholder'));
      const label = card.appendChild(element('div', 'label'));
      label.append(image(tab.icon, 'icon'));
      label.appendChild(element('span', 'title')).textContent = tab.title;
      card.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        ui.index = i;
        paint();
      });
      // The cross shown on hover drops that tab without picking it. The tab in
      // view always stays on the list, so it only gets a cross when Delete closes tabs.
      if (i > 0 || ui.closes) {
        const cross = card.appendChild(element('div', 'cross'));
        cross.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        cross.addEventListener('pointerup', (e) => {
          e.stopPropagation();
          drop(i);
        });
      }
      return card;
    });
    panel.replaceChildren(ui.glow, ...ui.cards);
    panel.classList.toggle('closes', ui.closes);

    if (tabs.length < 2) {
      hint.replaceChildren(item('', 'No other recent tabs yet'));
    } else {
      hint.replaceChildren(
        item('\u232B', ui.closes ? 'Close tab' : 'Remove from list', () =>
          drop(wrap(ui.index, ui.tabs.length)),
        ),
        item(MAC ? '\u2318\u232B' : '', 'Clear recents', clear),
      );
    }
    paint(false);
  }

  // One entry of the line under the switcher: a key, a label, and what a click does.
  function item(keys, label, run) {
    const node = element('span', run ? 'item action' : 'item');
    if (keys) node.appendChild(element('span', 'key')).textContent = keys;
    node.append(label);
    if (run) node.addEventListener('pointerup', run);
    return node;
  }

  // Moves the highlight to the selected tab.
  function paint(slide = true) {
    if (!ui.host) return;
    const { panel, glow } = ui;
    const card = ui.cards[wrap(ui.index, ui.cards.length)];
    // Cards shrink to fit. Past that the list scrolls, selected tab in the middle.
    panel.scrollLeft = card.offsetLeft - (panel.clientWidth - card.offsetWidth) / 2;
    glow.style.transition = slide ? '' : 'none';
    glow.style.width = `${card.offsetWidth}px`;
    glow.style.height = `${card.offsetHeight}px`;
    glow.style.transform = `translate(${card.offsetLeft}px, ${card.offsetTop}px)`;
  }

  // Empties the recent list: the current tab is all that is left. No tab is closed.
  function clear() {
    if (ui.tabs.length < 2) return;
    send({ type: 'clear' });
    ui.tabs = ui.tabs.slice(0, 1);
    ui.index = 0;
    render();
  }

  // Takes a tab off the list. Depending on the setting the tab stays open, or is
  // closed for real. Closing the tab we are on ends the switcher too.
  function drop(i) {
    if (i === 0 && !ui.closes) return;
    const selected = wrap(ui.index, ui.tabs.length);
    const [tab] = ui.tabs.splice(i, 1);
    send({ type: ui.closes ? 'close' : 'forget', tabId: tab.id });
    if (i === 0) return close();
    // The highlight stays on the same tab, or moves to a neighbour of the dropped one.
    ui.index = Math.min(selected > i ? selected - 1 : selected, ui.tabs.length - 1);
    render();
  }

  function styles() {
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(STYLE);
    }
    return sheet;
  }

  // Ask the background for a fresh preview of this page once it is visible and settled.
  function queuePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (!document.hidden && !ui) send({ type: 'preview' });
    }, 300);
  }

  addEventListener('load', queuePreview);
  document.addEventListener('visibilitychange', queuePreview);
  if (document.readyState === 'complete') queuePreview();

  const STYLE = `
    :host {
      all: initial !important;
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      pointer-events: none !important;
    }
    .box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      max-width: calc(100vw - 32px);
    }
    .panel,
    .hint {
      box-sizing: border-box;
      pointer-events: auto;
      user-select: none;
      cursor: default;
      font: 500 13px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #f5f5f7;
      background: rgba(28, 28, 32, 0.84);
      backdrop-filter: blur(24px) saturate(1.6);
      border: 1px solid rgba(255, 255, 255, 0.14);
      animation: pop 100ms ease-out;
    }
    .panel {
      position: relative;
      display: flex;
      gap: 4px;
      max-width: 100%;
      padding: 10px;
      overflow: hidden;
      border-radius: 20px;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5), 0 2px 10px rgba(0, 0, 0, 0.3);
    }
    .hint {
      display: flex;
      gap: 2px;
      padding: 3px;
      border-radius: 11px;
      font-size: 11.5px;
      color: rgba(245, 245, 247, 0.72);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }
    .item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 8px;
    }
    .action:hover { color: #fff; background: rgba(255, 255, 255, 0.14); }
    .key { font-size: 13px; line-height: 1; letter-spacing: 1px; }
    @keyframes pop {
      from { opacity: 0; transform: scale(0.97); }
    }
    .glow {
      position: absolute;
      top: 0;
      left: 0;
      border-radius: 12px;
      background: rgba(140, 110, 255, 0.5);
      transition: transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    @media (prefers-reduced-motion: reduce) {
      .panel, .hint { animation: none; }
      .glow { transition: none; }
    }
    .card {
      position: relative;
      flex: 0 1 172px;
      box-sizing: border-box;
      min-width: 120px;
      padding: 8px;
      border-radius: 12px;
    }
    .pointing .card:hover { background: rgba(255, 255, 255, 0.07); }
    .cross {
      position: absolute;
      top: 3px;
      right: 3px;
      display: none;
      box-sizing: border-box;
      width: 20px;
      height: 20px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 50%;
      background: rgba(20, 20, 24, 0.85);
    }
    .pointing .card:hover .cross { display: block; }
    .cross:hover { background: rgba(120, 120, 130, 0.95); }
    .closes .cross:hover { border-color: transparent; background: #e5484d; }
    .cross::before,
    .cross::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      width: 10px;
      height: 1.5px;
      margin: -0.75px 0 0 -5px;
      border-radius: 1px;
      background: #fff;
      transform: rotate(45deg);
    }
    .cross::after { transform: rotate(-45deg); }
    .shot {
      display: flex;
      align-items: center;
      justify-content: center;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border-radius: 7px;
      background: #3a3a40;
    }
    .preview {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top;
    }
    .placeholder { width: 32px; height: 32px; }
    .label {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-top: 8px;
      padding: 0 2px;
    }
    .icon { flex: none; width: 16px; height: 16px; border-radius: 3px; }
    .title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  `;
})();
