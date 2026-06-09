const token = localStorage.getItem('canRentLahToken');

if (token) {
  chrome.storage.local.set({ canRentLahToken: token, apiBase: window.location.origin });
}

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.source !== 'can-rent-lah-web') return;
  if (!event.data.token) return;
  chrome.storage.local.set({ canRentLahToken: event.data.token, apiBase: window.location.origin });
});
