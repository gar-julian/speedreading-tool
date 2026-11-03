// tab.title is only readable while the activeTab grant is live, which lasts
// from an extension click on a tab until that tab navigates or closes.
async function showTitle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById('page-title').textContent =
    tab?.title ?? 'Click the extension icon to read this page';
}

showTitle();

// Switching tabs: the new tab usually has no grant, so this shows the fallback.
chrome.tabs.onActivated.addListener(showTitle);

// Title changes on the active tab, e.g. single-page apps.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.title || changeInfo.status === 'complete')) {
    showTitle();
  }
});

// Context menu click while the panel is already open grants a new activeTab.
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'refresh_title') showTitle();
});

// Re-check when the user returns to the panel after re-granting via the icon.
window.addEventListener('focus', showTitle);
