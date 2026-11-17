// sidepanel.js — the reader that runs inside sidepanel-global.html.

const settingsEl = document.getElementById('settings');
const playerEl = document.getElementById('player');
const slider = document.getElementById('wpm');
const valueLabel = document.getElementById('wpmValue');
const startBtn = document.getElementById('start');
const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');
const stageEl = document.getElementById('stage');
const promptEl = document.getElementById('prompt');
const repeatBtn = document.getElementById('repeat');
const nextBtn = document.getElementById('next');
const stopBtn = document.getElementById('stop');

let chunks = [];
let current = 0;
let msPerWord = 1500;
let timer = null;
let onNext = null; // what the "next" button does right now

// ---------- Settings ----------
slider.value = localStorage.getItem('wpm') || 40;
valueLabel.textContent = slider.value;

slider.addEventListener('input', () => {
  valueLabel.textContent = slider.value;
});

startBtn.addEventListener('click', async () => {
  statusEl.textContent = '';
  const wpm = Number(slider.value);
  localStorage.setItem('wpm', wpm);
  msPerWord = 60000 / wpm;

  // Ask the page in the active tab for its chunks (see content-script.js).
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'get_chunks' });
    chunks = response?.chunks ?? [];
  } catch (error) {
    statusEl.textContent =
      "Can't read this page. Refresh the page and try again. (Extensions can't run on chrome:// pages.)";
    console.error(error);
    return;
  }

  if (chunks.length === 0) {
    statusEl.textContent = "Couldn't find any text to read on this page.";
    return;
  }

  settingsEl.hidden = true;
  playerEl.hidden = false;
  playChunk(0);
});

// ---------- Reading flow ----------
function show(text, isMessage = false) {
  stageEl.textContent = text;
  stageEl.classList.toggle('message', isMessage);
}

function playChunk(index) {
  current = index;
  promptEl.hidden = true;
  progressEl.textContent = `Chunk ${index + 1} of ${chunks.length}`;
  show('');

  const words = chunks[index].split(' ');
  let i = 0;

  const nextWord = () => {
    if (i < words.length) {
      show(words[i++]);
      timer = setTimeout(nextWord, msPerWord);
    } else {
      askToRepeat();
    }
  };
  timer = setTimeout(nextWord, 600); // short pause before the first word
}

function askToRepeat() {
  const isLast = current === chunks.length - 1;
  show('Repeat this chunk?', true);
  repeatBtn.hidden = false;
  nextBtn.textContent = isLast ? 'Finish (N)' : 'Next chunk (N)';
  onNext = isLast ? finish : () => playChunk(current + 1);
  promptEl.hidden = false;
}

function finish() {
  progressEl.textContent = '';
  show("That's the article!", true);
  repeatBtn.hidden = true;
  nextBtn.textContent = 'Done';
  onNext = stop;
  promptEl.hidden = false;
}

function stop() {
  clearTimeout(timer);
  promptEl.hidden = true;
  playerEl.hidden = true;
  settingsEl.hidden = false;
  show('');
}

// Hide the prompt first so a key press and a click can't both fire.
function act(fn) {
  if (promptEl.hidden) return;
  promptEl.hidden = true;
  fn();
}

repeatBtn.addEventListener('click', () => act(() => playChunk(current)));
nextBtn.addEventListener('click', () => act(() => onNext()));
stopBtn.addEventListener('click', stop);

// ---------- Keyboard shortcuts (work while the side panel has focus) ----------
document.addEventListener('keydown', (event) => {
  if (playerEl.hidden) return;

  if (event.key === 'Escape') {
    stop();
    return;
  }

  const key = event.key.toLowerCase();
  const onButton = event.target.tagName === 'BUTTON';

  if (key === 'r' || key === 'arrowleft') {
    if (!repeatBtn.hidden) act(() => playChunk(current));
  } else if (key === 'n' || key === 'arrowright') {
    act(() => onNext());
  } else if ((key === ' ' || key === 'enter') && !onButton) {
    // Space/Enter on a focused button already triggers that button.
    event.preventDefault();
    act(() => onNext());
  }
});