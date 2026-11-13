// Click the icon ->
//   1. start reading the page in this same turn (activeTab only lasts for the click)
//   2. open the side panel, also in this turn
//   3. hand the text to reader.html and stay alive until that finishes

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ path: 'reader.html', enabled: true });
});

let latestPage = null;
let captureToken = 0;
let captureDone = Promise.resolve();

chrome.action.onClicked.addListener((tab) => {
  const token = ++captureToken;

  const reading = chrome.scripting
    .executeScript({ target: { tabId: tab.id }, func: readPageText })
    .then(([result]) => {
      const text = result && typeof result.result === 'string' ? result.result.trim() : '';
      return text
        ? { token, title: tab.title, text }
        : { token, title: tab.title, error: 'This page did not have any readable text.' };
    })
    .catch((err) => ({
      token,
      title: tab.title,
      error: err && err.message ? err.message : String(err)
    }));

  const opened = chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => {
    console.error('Could not open the side panel', err);
  });

  // Return this promise so Chrome does not stop the worker before the text is saved.
  captureDone = publish(token, { token, title: tab.title, loading: true })
    .then(() => reading)
    .then((page) => publish(token, page))
    .then(() => opened)
    .catch((err) => {
      console.error('Could not capture the page', err);
    });

  return captureDone;
});

// Runs in the page. Must be self-contained: Chrome copies only this function.
function readPageText() {
  const paragraphs = [...document.querySelectorAll('p')]
    .map((p) => p.textContent.trim().replace(/\s+/g, ' '))
    .filter((t) => t.split(' ').length > 4);
  if (paragraphs.length) return paragraphs.join(' ');

  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
  const parts = [];
  const root = document.body || document.documentElement;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (parent && skip.has(parent.tagName)) continue;
    const bit = node.textContent.replace(/\s+/g, ' ').trim();
    if (bit) parts.push(bit);
  }
  return parts.join(' ');
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
