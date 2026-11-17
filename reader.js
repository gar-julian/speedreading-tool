// The side panel: takes the page text the service worker saved, and flashes it.

const wordEl = document.getElementById('word');
const titleEl = document.getElementById('title');
const barEl = document.getElementById('bar');
const playBtn = document.getElementById('play');
const restartBtn = document.getElementById('restart');
const wpmInput = document.getElementById('wpm');
const wpmLabel = document.getElementById('wpmLabel');
const msgEl = document.getElementById('msg');
const promptEl = document.getElementById('prompt');

let paragraphs = [];
let paraIndex = 0;
let wordIndex = 0;
let timer = null;
let waitingForParagraph = false;
let pageTitle = '';

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

  // Reset playback for the new page (don't call pause(): it would act on the
  // old paragraphs and could show a "paragraph done" prompt).
  clearTimeout(timer);
  timer = null;
  waitingForParagraph = false;
  hidePrompt();
  playBtn.textContent = 'Play';
  paragraphs = [];
  paraIndex = 0;
  wordIndex = 0;
  pageTitle = page?.title || '';

  if (page?.loading) {
    titleEl.textContent = page.title || 'Reading page…';
    msgEl.textContent = '';
    show('…');
    return;
  }

  paragraphs = pageParagraphs(page);
  if (!paragraphs.length) {
    titleEl.textContent = pageTitle;
    msgEl.textContent = page ? readError(page) : 'Click the extension icon on a page to start reading.';
    show('—');
    return;
  }

  msgEl.textContent = '';
  updateTitle();
  show(paragraphs[0][0] || '—');
}

// Returns an array of paragraphs, each an array of words.
function pageParagraphs(page) {
  if (!page || page.loading || page.error) return [];
  if (typeof page.text === 'string') {
    return page.text
      .split(/\n\s*\n/)
      .map(toWords)
      .filter((para) => para.length);
  }
  if (typeof page.html === 'string') return textFromHtml(page.html);
  return [];
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

  if (paragraphs.length) return paragraphs.map(toWords);

  // No <p> tags? Fall back to all the body text, minus scripts/styles.
  doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
  const text = doc.body ? doc.body.textContent : '';
  const chunks = text
    .split(/\n\s*\n/)
    .map((t) => t.trim().replace(/\s+/g, ' '))
    .filter((t) => t.split(' ').length > 4);
  if (chunks.length) return chunks.map(toWords);

  const one = text.trim().replace(/\s+/g, ' ');
  return one ? [toWords(one)] : [];
}

function toWords(text) {
  return text.split(/\s+/).filter(Boolean);
}

function totalWords() {
  return paragraphs.reduce((n, para) => n + para.length, 0);
}

function wordsFinished() {
  let n = wordIndex;
  for (let i = 0; i < paraIndex; i++) n += paragraphs[i].length;
  return n;
}

function updateTitle() {
  const total = totalWords();
  const count = paragraphs.length;
  let label = '';
  if (count) {
    label = waitingForParagraph
      ? ` · paragraph ${paraIndex} of ${count} done`
      : ` · paragraph ${Math.min(paraIndex + 1, count)} of ${count}`;
  }
  titleEl.textContent = `${pageTitle} · ${total} words${label}`;
}

// --- 3. Flash the words -------------------------------------------------

function show(word) {
  const p = Math.max(0, Math.ceil(word.length / 3) - 1);
  wordEl.innerHTML =
    `<span class="before">${escape(word.slice(0, p))}</span>` +
    `<span class="pivot">${escape(word[p] || '')}</span>` +
    `<span class="after">${escape(word.slice(p + 1))}</span>`;
  fitWord();
}

// The side panel is narrow, so shrink a long word until the letters on each
// side of the (fixed, centered) pivot fit in their half of the stage.
function fitWord() {
  const before = wordEl.querySelector('.before');
  const after = wordEl.querySelector('.after');
  if (!before || !after || wordEl.clientWidth <= 0) return;
  const overflows = () =>
    before.scrollWidth > before.clientWidth || after.scrollWidth > after.clientWidth;
  let size = 40;
  wordEl.style.fontSize = size + 'px';
  while (size > 14 && overflows()) {
    size -= 1;
    wordEl.style.fontSize = size + 'px';
  }
  const total = totalWords();
  barEl.style.width = total ? `${(wordsFinished() / total) * 100}%` : '0';
  // The guide line's gap around the word scales with the font size.
  wordEl.parentElement.style.setProperty('--word-size', size + 'px');
}

window.addEventListener('resize', fitWord);

function tick() {
  if (paraIndex >= paragraphs.length) return finish();
  const para = paragraphs[paraIndex];
  if (wordIndex >= para.length) {
    paraIndex++;
    wordIndex = 0;
    if (paraIndex >= paragraphs.length) return finish();
    return pauseForParagraph();
  }

  const word = para[wordIndex];
  show(word);
  wordIndex++;

  let delay = 60000 / Number(wpmInput.value);
  if (word.length > 8) delay *= 1.3;
  if (/[.!?]$/.test(word)) delay *= 2;
  else if (/[,;:]$/.test(word)) delay *= 1.5;

  timer = setTimeout(tick, delay);
}

function play() {
  if (!totalWords()) return;
  if (paraIndex >= paragraphs.length) {
    paraIndex = 0;
    wordIndex = 0;
  }
  waitingForParagraph = false;
  hidePrompt();
  playBtn.textContent = 'Pause';
  updateTitle();
  tick();
}

function pause() {
  clearTimeout(timer);
  timer = null;
  // The last word is already counted, so stopping here is the paragraph break.
  if (isAtParagraphEnd()) {
    paraIndex++;
    wordIndex = 0;
    if (paraIndex >= paragraphs.length) return finish();
    return pauseForParagraph();
  }
  waitingForParagraph = false;
  hidePrompt();
  playBtn.textContent = 'Play';
}

function isAtParagraphEnd() {
  const para = paragraphs[paraIndex];
  return Boolean(para) && wordIndex >= para.length;
}

function pauseForParagraph() {
  clearTimeout(timer);
  timer = null;
  waitingForParagraph = true;
  playBtn.textContent = 'Continue';
  updateTitle();
  showPrompt(
    `Paragraph ${paraIndex} of ${paragraphs.length} is done. Continue when you're ready.`
  );
}

function finish() {
  clearTimeout(timer);
  timer = null;
  waitingForParagraph = false;
  playBtn.textContent = 'Play';
  updateTitle();
  showPrompt('Finished. Press Play to read it again.');
}

function showPrompt(text) {
  promptEl.hidden = false;
  promptEl.textContent = text;
}

function hidePrompt() {
  promptEl.hidden = true;
  promptEl.textContent = '';
}

// --- Controls -----------------------------------------------------------

playBtn.addEventListener('click', () => (timer ? pause() : play()));

restartBtn.addEventListener('click', () => {
  clearTimeout(timer);
  timer = null;
  waitingForParagraph = false;
  hidePrompt();
  playBtn.textContent = 'Play';
  paraIndex = 0;
  wordIndex = 0;
  updateTitle();
  if (paragraphs.length) show(paragraphs[0][0]);
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

// --- Theme --------------------------------------------------------------
// Follows the system setting until the user clicks the toggle; the choice
// is remembered in localStorage (synchronous, so no flash of the wrong theme).

const themeBtn = document.getElementById('theme');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function savedTheme() {
  try { return localStorage.getItem('theme'); } catch { return null; }
}

function isDark() {
  const t = savedTheme();
  return t ? t === 'dark' : systemDark.matches;
}

function applyTheme() {
  const t = savedTheme();
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  themeBtn.textContent = isDark() ? 'Light mode' : 'Dark mode';
}

themeBtn.addEventListener('click', () => {
  try { localStorage.setItem('theme', isDark() ? 'light' : 'dark'); } catch {}
  applyTheme();
  themeBtn.blur(); // keep Space for play/pause
});

systemDark.addEventListener('change', applyTheme);
applyTheme();

function escape(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}