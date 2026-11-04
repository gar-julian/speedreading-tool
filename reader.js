// The reader tab: takes the saved HTML, pulls out the text, flashes it.

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

// --- 1. Get the HTML the service worker saved ---------------------------

chrome.storage.session.get('page').then(({ page }) => {
  if (!page || page.error || !page.html) {
    titleEl.textContent = page?.title || '';
    msgEl.textContent = "Couldn't read that page (Chrome blocks extensions on chrome:// pages and the Web Store).";
    show('—');
    return;
  }

  const text = textFromHtml(page.html);
  words = text.split(/\s+/).filter(Boolean);
  titleEl.textContent = `${page.title} · ${words.length} words`;
  show(words[0] || '—');
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
}

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