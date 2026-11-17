// Remembers what was right-clicked, so "Speed read from here" knows where to start.
// executeScript runs in this same isolated world, so it can read the global.
document.addEventListener(
  'contextmenu',
  (e) => {
    window.__speedreadTarget = e.target;
  },
  true
);
