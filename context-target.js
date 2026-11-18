// Remembers what was right-clicked, so "Speed read from here" knows where to start.
// executeScript runs in this same isolated world, so it can read the global.
document.addEventListener(
  'contextmenu',
  (e) => {
    window.__speedreadTarget = e.target;
  },
  true
);

// The reader panel tells us which paragraph it is on; mark it on the page with
// a pastel red background. readPageText (service-worker.js) runs in this same
// isolated world and leaves the paragraph elements in __speedreadParagraphs.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'speedread-highlight') return;

  if (!document.getElementById('speedread-highlight-style')) {
    const style = document.createElement('style');
    style.id = 'speedread-highlight-style';
    // box-shadow pads the highlight without shifting the page layout.
    style.textContent =
      '.speedread-current { background-color: #ffd6d6 !important;' +
      ' border-radius: 4px; box-shadow: 0 0 0 4px #ffd6d6; }';
    (document.head || document.documentElement).append(style);
  }

  document
    .querySelectorAll('.speedread-current')
    .forEach((el) => el.classList.remove('speedread-current'));

  const el = (window.__speedreadParagraphs || [])[message.index];
  if (el && el.isConnected) el.classList.add('speedread-current');
});
