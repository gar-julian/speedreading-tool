// The side panel: takes the page text the service worker saved, and flashes it.

const wordEl = document.getElementById('word');
const titleEl = document.getElementById('title');
const barEl = document.getElementById('bar');
const playBtn = document.getElementById('play');
const restartBtn = document.getElementById('restart');
const wpmInput = document.getElementById('wpm');
const wpmLabel = document.getElementById('wpmLabel');
const msgEl = document.getElementById('msg');

let words = [];
let index = 0;
let timer = null;

// --- 1. Get the text the service worker saved ---------------------------
// The panel often opens before the capture finishes. It asks the worker for
// the page (that call waits until the capture is done) and also accepts a
// later push. A slow "loading" update must not replace the finished text.

let appliedToken = -1;
let appliedReady = false;

function applyPage(page) {
  const token = Number.isFinite(page?.token) ? page.token : appliedToken;
  if (token < appliedToken) return;
  if (token === appliedToken && appliedReady && page?.loading) return;
  appliedToken = token;
  appliedReady = Boolean(page) && !page.loading;

  pause();
  index = 0;
  words = [];

  if (page?.loading) {
    titleEl.textContent = page.title || 'Reading page…';
    msgEl.textContent = '';
    show('…');
    return;
  }

  const text = pageText(page);
  if (!text) {
    titleEl.textContent = page?.title || '';
    msgEl.textContent = page ? readError(page) : 'Click the extension icon on a page to start reading.';
    show('—');
    return;
  }

  msgEl.textContent = '';
  words = text.split(/\s+/).filter(Boolean);
  titleEl.textContent = `${page.title} · ${words.length} words`;
  show(words[0] || '—');
}

function pageText(page) {
  if (!page || page.loading || page.error) return '';
  if (typeof page.text === 'string') return page.text;
  if (typeof page.html === 'string') return textFromHtml(page.html);
  return '';
}

function readError(page) {
  const error = page.error || '';
  if (/cannot access contents|cannot be scripted|extensions gallery|chrome:\/\//i.test(error)) {
    return "Couldn't read that page (Chrome blocks extensions on chrome:// pages and the Web Store).";
  }
  return error || "Couldn't read that page.";
}

function pullPage() {
  chrome.runtime.sendMessage({ type: 'get-page' }, (response) => {
    if (chrome.runtime.lastError) return;
    applyPage(response?.page);
  });
}

pullPage();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes.page) return;
  if (changes.page.newValue) applyPage(changes.page.newValue);
  else pullPage();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'page-ready') applyPage(message.page);
});

// --- 2. Turn the HTML string into readable text -------------------------

function textFromHtml(html) {
  // DOMParser turns the HTML string into a document we can query,
  // just like `document` on a real page — but nothing on it runs.
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const paragraphs = [...doc.querySelectorAll('p')]
    .map((p) => p.textContent.trim().replace(/\s+/g, ' '))
    .filter((t) => t.split(' ').length > 4); // skip captions, buttons, etc.

  if (paragraphs.length) return paragraphs.join(' ');

  // No <p> tags? Fall back to all the body text, minus scripts/styles.
  doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
  return doc.body ? doc.body.textContent : '';
}

// --- 3. Flash the words -------------------------------------------------

function show(word) {
  const p = Math.max(0, Math.ceil(word.length / 3) - 1);
  wordEl.innerHTML =
    escape(word.slice(0, p)) +
    `<span class="pivot">${escape(word[p] || '')}</span>` +
    escape(word.slice(p + 1));
  barEl.style.width = words.length ? `${(index / words.length) * 100}%` : '0';
  fitWord();
}

// The side panel is narrow, so shrink a long word until it fits on one line.
function fitWord() {
  const stage = document.getElementById('stage');
  const max = stage.clientWidth - 24;
  if (max <= 0) return;
  let size = 40;
  wordEl.style.fontSize = size + 'px';
  while (size > 14 && wordEl.scrollWidth > max) {
    size -= 1;
    wordEl.style.fontSize = size + 'px';
  }
}

window.addEventListener('resize', fitWord);

function tick() {
  if (index >= words.length) return pause();
  const word = words[index];
  show(word);
  index++;

  let delay = 60000 / Number(wpmInput.value);
  if (word.length > 8) delay *= 1.3;
  if (/[.!?]$/.test(word)) delay *= 2;
  else if (/[,;:]$/.test(word)) delay *= 1.5;

  timer = setTimeout(tick, delay);
}

function play() {
  if (!words.length) return;
  if (index >= words.length) index = 0;
  playBtn.textContent = 'Pause';
  tick();
}

function pause() {
  clearTimeout(timer);
  timer = null;
  playBtn.textContent = 'Play';
}

// --- Controls -----------------------------------------------------------

playBtn.addEventListener('click', () => (timer ? pause() : play()));

restartBtn.addEventListener('click', () => {
  pause();
  index = 0;
  if (words.length) show(words[0]);
});

wpmInput.addEventListener('input', () => {
  wpmLabel.textContent = `${wpmInput.value} wpm`;
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    timer ? pause() : play();
  }
});

function escape(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}