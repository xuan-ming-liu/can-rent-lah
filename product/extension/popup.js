chrome.storage.local.get(['canRentLahToken', 'apiBase'], ({ canRentLahToken, apiBase }) => {
  document.querySelector('#status').textContent = canRentLahToken
    ? '已连接。打开 PropertyGuru 后会自动出现租房助手侧边栏。'
    : '还没有同步登录状态。请先打开工作台登录。';

  const loginUrl = apiBase || '';
  const btn = document.querySelector('#loginBtn');
  if (!loginUrl) {
    btn.textContent = '请先配置工作台地址';
    btn.disabled = true;
  } else {
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: loginUrl });
    });
  }
});
