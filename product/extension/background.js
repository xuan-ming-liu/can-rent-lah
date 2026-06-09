// Background service worker — proxies API calls to bypass mixed content (HTTPS → HTTP)
// Content scripts on HTTPS pages can't fetch HTTP directly, but the service worker can.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'api-request') return false;

  const { url, method, headers, body } = message;

  fetch(url, {
    method: method || 'GET',
    headers: headers || {},
    body: body ? JSON.stringify(body) : undefined,
  })
    .then(async (res) => {
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { _raw: text }; }
      sendResponse({ ok: res.ok, status: res.status, data });
    })
    .catch((err) => {
      sendResponse({ ok: false, status: 0, data: { error: err.message } });
    });

  return true; // keep channel open for async response
});
