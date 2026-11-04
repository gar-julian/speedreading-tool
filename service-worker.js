// Click the icon ->
//   1. grab the page's HTML (activeTab + scripting)
//   2. hand it to reader.html in a new tab (storage)

chrome.action.onClicked.addListener(async (tab) => {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML
    });
    const html = '<!doctype html>\n' + result.result;

    await chrome.storage.session.set({ page: { title: tab.title, html } });
  } catch (err) {
    // chrome:// pages and the Web Store can't be read by extensions
    await chrome.storage.session.set({ page: { title: tab.title, error: err.message } });
  }

  chrome.tabs.create({ url: 'reader.html' });
});