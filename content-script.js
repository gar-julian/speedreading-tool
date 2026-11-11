const button = new DOMParser().parseFromString(
  '<button>Click to open side panel</button>',
  'text/html'
).body.firstElementChild;
button.addEventListener('click', function () {
  chrome.runtime.sendMessage({ type: 'open_side_panel' });
});
document.body.append(button);

// adding a visual banner that yells at user to extend panel

const banner = document.createElement('div');
banner.textContent = 'OPEN THE SIDE PANEL! CLICK ME!';
Object.assign(banner.style, {
  position: 'fixed',
  top: '0',
  left: '0',
  right: '0',
  zIndex: '2147483647',
  padding: '16px',
  background: 'red',
  color: 'white',
  fontSize: '28px',
  fontWeight: 'bold',
  textAlign: 'center',
  cursor: 'pointer',
  display: 'none'
});
banner.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'open_side_panel' });
  banner.style.display = 'none';
});
document.body.append(banner);

setInterval(async () => {
  const { open } = await chrome.runtime.sendMessage({ type: 'check_side_panel' });
  banner.style.display = open ? 'none' : 'block';
}, 15000);