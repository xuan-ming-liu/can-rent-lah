/* ==========================================================================
   Can Rent Lah — Extension Popup
   GSAP-powered status display
   ========================================================================== */

const statusEl = document.getElementById('statusText');
const statusArea = document.getElementById('statusArea');
const loginBtn = document.getElementById('loginBtn');

function setStatus(connected, text) {
  const badge = statusArea.querySelector('.status-badge');
  const dot = badge.querySelector('.dot');

  badge.className = `status-badge ${connected ? 'connected' : 'disconnected'}`;
  dot.className = `dot ${connected ? 'online' : 'offline'}`;
  statusEl.textContent = text;

  // Animate the transition
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(badge, { scale: 0.96, opacity: 0.7 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'power2.out' });
  }
}

// Check stored credentials
chrome.storage.local.get(['canRentLahToken', 'apiBase'], ({ canRentLahToken, apiBase }) => {
  if (canRentLahToken) {
    setStatus(true, '已连接。打开 PropertyGuru 后会自动出现租房助手侧边栏。');
  } else {
    setStatus(false, '还没有同步登录状态。请先打开工作台登录。');
  }

  const loginUrl = apiBase || '';
  if (!loginUrl) {
    loginBtn.textContent = '请先配置工作台地址';
    loginBtn.disabled = true;
  } else {
    loginBtn.addEventListener('click', () => {
      // Button press animation
      if (typeof gsap !== 'undefined') {
        gsap.to(loginBtn, { scale: 0.96, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.inOut' });
      }
      chrome.tabs.create({ url: loginUrl });
    });
  }
});

// Entrance animation
if (typeof gsap !== 'undefined') {
  gsap.from('body > *', {
    opacity: 0,
    y: 8,
    stagger: 0.06,
    duration: 0.35,
    ease: 'power3.out',
    delay: 0.05,
  });
}
