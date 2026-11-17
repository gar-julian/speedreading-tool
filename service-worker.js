// Click the icon ->
//   1. start reading the page in this same turn (activeTab only lasts for the click)
//   2. open the side panel, also in this turn
//   3. hand the text to reader.html and stay alive until that finishes

// An older build set openPanelOnActionClick: true, and Chrome remembers that
// across reloads. While it is on, Chrome opens the panel itself and
// action.onClicked never fires, so the page is never captured. Turn it off.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => console.error('Could not set panel behavior', err));

const MENU_ID = 'speedread-from-here';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ path: 'reader.html', enabled: true });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Speed read from here',
      contexts: ['page', 'selection', 'link']
    });
  });
});

let latestPage = null;
let captureToken = 0;
let captureDone = Promise.resolve();

chrome.action.onClicked.addListener((tab) => startCapture(tab, false));

// Right-click -> "Speed read from here" starts at the paragraph that was clicked.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab) return;
  return startCapture(tab, true);
});

function startCapture(tab, fromClick) {
  // Open first, synchronously, while we still have the user gesture.
  const opened = chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => {
    console.error('Could not open the side panel', err);
  });

  // Chrome kills idle service workers, which would reset a plain counter to 0
  // while the panel (still open) remembers a higher token and ignores new pages.
  // A timestamp-based token keeps increasing across worker restarts.
  const token = (captureToken = Math.max(Date.now(), captureToken + 1));

  const reading = chrome.scripting
    .executeScript({ target: { tabId: tab.id }, func: readPageText, args: [fromClick] })
    .then(([result]) => {
      const read = result && result.result;
      const text = read && typeof read.text === 'string' ? read.text.trim() : '';
      return text
        ? {
            token,
            tabId: tab.id,
            title: tab.title,
            text,
            startParagraph: read.startParagraph || 0,
            startWord: read.startWord || 0
          }
        : { token, tabId: tab.id, title: tab.title, error: 'This page did not have any readable text.' };
    })
    .catch((err) => ({
      token,
      tabId: tab.id,
      title: tab.title,
      error: err && err.message ? err.message : String(err)
    }));

  // Return this promise so Chrome does not stop the worker before the text is saved.
  captureDone = publish(token, { token, title: tab.title, loading: true })
    .then(() => reading)
    .then((page) => publish(token, page))
    .then(() => opened)
    .catch((err) => {
      console.error('Could not capture the page', err);
    });

  return captureDone;
}

// Runs in the page. Must be self-contained: Chrome copies only this function.
// Returns { text, startParagraph, startWord }. When fromClick is set, the start
// points at the element context-target.js saw being right-clicked.
function readPageText(fromClick) {
  let target = fromClick ? window.__speedreadTarget : null;
  if (target && !target.isConnected) target = null;

  // True if node is the target, inside it, or comes after it in the page.
  const atOrAfterTarget = (node) =>
    node === target ||
    node.contains(target) ||
    Boolean(target.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);

  // Clear any highlight left over from an earlier read of this page.
  document
    .querySelectorAll('.speedread-current')
    .forEach((el) => el.classList.remove('speedread-current'));

  const paragraphs = [...document.querySelectorAll('p')]
    .map((el) => ({ el, text: el.textContent.trim().replace(/\s+/g, ' ') }))
    .filter((p) => p.text.split(' ').length > 4);
  // context-target.js (same isolated world) highlights these by index.
  window.__speedreadParagraphs = paragraphs.map((p) => p.el);
  if (paragraphs.length) {
    let startParagraph = 0;
    if (target) {
      const i = paragraphs.findIndex((p) => atOrAfterTarget(p.el));
      startParagraph = i === -1 ? paragraphs.length - 1 : i;
    }
    // Blank lines between paragraphs let the reader pause at each break.
    return { text: paragraphs.map((p) => p.text).join('\n\n'), startParagraph, startWord: 0 };
  }

  window.__speedreadParagraphs = []; // no paragraph elements to highlight
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
  const parts = [];
  let startWord = 0;
  let found = !target;
  const root = document.body || document.documentElement;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (parent && skip.has(parent.tagName)) continue;
    const bit = node.textContent.replace(/\s+/g, ' ').trim();
    if (!bit) continue;
    if (!found && atOrAfterTarget(node)) found = true;
    if (!found) startWord += bit.split(' ').length;
    parts.push(bit);
  }
  return { text: parts.join(' '), startParagraph: 0, startWord: found ? startWord : 0 };
}

async function publish(token, page) {
  if (token !== captureToken) return;
  latestPage = page;
  try {
    await chrome.storage.session.set({ page });
  } catch (err) {
    console.error('Could not save the page', err);
  }
  if (token !== captureToken) return;
  chrome.runtime.sendMessage({ type: 'page-ready', page }).catch(() => {
    // The panel asks for the page itself if it is not listening yet.
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'get-page') return;
  captureDone.then(async () => {
    if (!latestPage) {
      const stored = await chrome.storage.session.get('page');
      latestPage = stored.page || null;
    }
    sendResponse({ page: latestPage });
  });
  return true;
});
