const DEFAULT_API_BASE = 'http://101.47.73.151:8787';

chrome.storage.local.get(['canRentLahToken', 'apiBase'], ({ canRentLahToken, apiBase }) => {
  document.querySelector('#status').textContent = canRentLahToken
    ? '已连接。打开 PropertyGuru 后会出现侧边栏。'
    : '未连接。也可以直接打开 PropertyGuru 进入本地测试模式。';

  document.querySelector('#loginBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: apiBase || DEFAULT_API_BASE });
  });
});
