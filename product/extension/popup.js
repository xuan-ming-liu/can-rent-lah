const DEFAULT_API_BASE = 'http://101.47.73.151:8787';

chrome.storage.local.get(['canRentLahToken', 'apiBase'], ({ canRentLahToken, apiBase }) => {
  document.querySelector('#status').textContent = canRentLahToken
    ? '已连接。打开 PropertyGuru 后会自动出现租房助手侧边栏。'
    : '还没有同步登录状态。请先打开工作台登录。';

  document.querySelector('#loginBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: apiBase || DEFAULT_API_BASE });
  });
});
