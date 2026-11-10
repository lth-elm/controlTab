// Settings page, also shown as the toolbar popup.

const BINDINGS = { forward: 'Ctrl+Tab', backward: 'Ctrl+Shift+Tab' };

// Each group of radio buttons is one setting, stored under the group's name.
//   mode: "visual" shows the switcher, "direct" jumps to the last used tab.
//   remove: what Delete and the cross do to a tab, "forget" it or "close" it.
const DEFAULTS = { mode: 'visual', remove: 'forget' };
chrome.storage.sync.get(DEFAULTS).then((settings) => {
  for (const radio of document.querySelectorAll('input[type="radio"]')) {
    radio.checked = radio.value === settings[radio.name];
    radio.addEventListener('change', () => chrome.storage.sync.set({ [radio.name]: radio.value }));
  }
});

// The command that binds Ctrl+Tab, to be pasted in the console of the shortcuts page.
const snippet = Object.entries(BINDINGS)
  .map(
    ([commandName, keybinding]) =>
      `chrome.developerPrivate.updateExtensionCommand({ extensionId: "${chrome.runtime.id}", commandName: "${commandName}", keybinding: "${keybinding}" });`,
  )
  .join('\n');
document.getElementById('snippet').textContent = snippet;

document.getElementById('copy').addEventListener('click', async (e) => {
  await navigator.clipboard.writeText(snippet);
  e.target.textContent = 'Copied';
  setTimeout(() => (e.target.textContent = 'Copy'), 1500);
});

document.getElementById('clear').addEventListener('click', async (e) => {
  await chrome.runtime.sendMessage({ type: 'clear' });
  e.target.textContent = 'Cleared';
  setTimeout(() => (e.target.textContent = 'Clear recent tabs'), 1500);
});

document.getElementById('open-shortcuts').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

async function showShortcuts() {
  const commands = await chrome.commands.getAll();
  let missing = false;
  for (const name of Object.keys(BINDINGS)) {
    const shortcut = commands.find((command) => command.name === name)?.shortcut;
    const cell = document.getElementById(name);
    cell.replaceChildren();
    if (shortcut) {
      cell.appendChild(document.createElement('kbd')).textContent = shortcut;
    } else {
      cell.textContent = 'Not set';
      missing = true;
    }
    cell.classList.toggle('unset', !shortcut);
  }
  if (missing) document.getElementById('setup').open = true;
}

showShortcuts();
addEventListener('focus', showShortcuts); // coming back from the shortcuts page
