// The reader tab: takes the saved HTML, pulls out the text, flashes it.

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

// --- 1. Get the HTML the service worker saved ---------------------------

chrome.storage.session.get('page').then(({ page }) => {
  if (!page || page.error || !page.html) {
    titleEl.textContent = page?.title || '';
    msgEl.textContent = "Couldn't read that page (Chrome blocks extensions on chrome:// pages and the Web Store).";
    show('—');
    return;
  }

  pageTitle = page.title || '';
  paragraphs = textFromHtml(page.html);
  updateTitle();
  const first = paragraphs[0]?.[0];
  show(first || '—');
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
    escape(word.slice(0, p)) +
    `<span class="pivot">${escape(word[p] || '')}</span>` +
    escape(word.slice(p + 1));
  const total = totalWords();
  barEl.style.width = total ? `${(wordsFinished() / total) * 100}%` : '0';
}

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