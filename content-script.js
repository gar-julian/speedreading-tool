// content-script.js — runs on web pages and hands the page's text to the side panel as "chunks".

const MIN_WORDS_PER_CHUNK = 4; // ignores tiny fragments like "Share" or captions

// A chunk is one paragraph, list item, or block quote.
// Headings are attached to the start of the chunk that follows them.
const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,blockquote';
const IGNORE = 'nav,footer,aside,form,script,style,noscript,[aria-hidden="true"]';

function isVisible(el) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function extractChunks(root) {
  const chunks = [];
  let pendingHeading = '';

  for (const el of root.querySelectorAll(BLOCKS)) {
    if (el.closest(IGNORE) || !isVisible(el)) continue;
    // Skip wrappers (like an <li> that holds a <p>); the inner element is used instead.
    if (el.querySelector(BLOCKS)) continue;

    const text = el.innerText.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    if (/^H[1-6]$/.test(el.tagName)) {
      pendingHeading = text;
      continue;
    }

    if (text.split(' ').length < MIN_WORDS_PER_CHUNK) continue;

    chunks.push(pendingHeading ? `${pendingHeading} ${text}` : text);
    pendingHeading = '';
  }
  return chunks;
}

function getChunks() {
  // Prefer the article body; fall back to the whole page.
  const roots = [
    document.querySelector('article'),
    document.querySelector('main, [role="main"]'),
    document.body
  ];
  for (const root of roots) {
    if (!root) continue;
    const chunks = extractChunks(root);
    if (chunks.length) return chunks;
  }
  return [];
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get_chunks') {
    sendResponse({ chunks: getChunks() });
  }
  // No async work, so nothing else to return.
});