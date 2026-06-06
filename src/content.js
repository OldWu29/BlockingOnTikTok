const MESSAGE_SOURCE = 'douyin-block-extension';
let injectReady = false;
let requestCounter = 0;
let currentAuthorState = { secUid: '', blocked: false };

function injectPageScript() {
  if (document.getElementById('douyin-block-inject')) return;

  const script = document.createElement('script');
  script.id = 'douyin-block-inject';
  script.src = chrome.runtime.getURL('src/inject.js');
  script.onload = () => {
    injectReady = true;
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

function callPage(action, payload) {
  return new Promise((resolve, reject) => {
    const requestId = ++requestCounter;
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('请求超时，请刷新页面后重试'));
    }, 15000);

    function onMessage(event) {
      if (event.source !== window || !event.data || event.data.source !== MESSAGE_SOURCE) return;
      if (event.data.requestId !== requestId) return;

      const resultAction =
        action === 'get-author' ? 'get-author-result' : 'block-user-result';
      if (event.data.action !== resultAction) return;

      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);

      if (action === 'get-author') {
        resolve(event.data.author || null);
      } else {
        resolve(event.data.result || { success: false, error: '无响应' });
      }
    }

    window.addEventListener('message', onMessage);
    window.postMessage({ source: MESSAGE_SOURCE, action, requestId, payload }, '*');
  });
}

function showToast(message, type = 'info') {
  let toast = document.getElementById('douyin-block-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'douyin-block-toast';
    document.body.appendChild(toast);
  }

  toast.className = 'douyin-block-toast douyin-block-toast--' + type;
  toast.textContent = message;
  toast.classList.add('is-visible');

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2400);
}

async function getCurrentAuthor() {
  if (!injectReady) injectPageScript();
  await new Promise((r) => setTimeout(r, 300));
  const author = await callPage('get-author');
  if (!author?.secUid) return author;

  const blocked = await BlacklistStorage.isBlocked(author.secUid);
  currentAuthorState = { secUid: author.secUid, blocked };
  return { ...author, blocked };
}

async function blockUserById(secUid, userId, nickname, unblock = false) {
  const result = await callPage('block-user', {
    secUid,
    userId,
    unblock
  });

  if (result.success) {
    if (unblock) {
      await BlacklistStorage.remove(secUid);
      showToast(`已解除拉黑：${nickname || result.nickname || '该用户'}`, 'success');
    } else {
      await BlacklistStorage.add({
        secUid,
        userId,
        nickname: nickname || result.nickname || '未知用户'
      });
      showToast(`已拉黑：${nickname || result.nickname || '该用户'}`, 'success');
    }

    if (currentAuthorState.secUid === secUid) {
      currentAuthorState.blocked = !unblock;
      updateFloatingButton(!unblock);
    }
  } else {
    showToast(result.error || '操作失败，请确认已登录抖音', 'error');
  }

  return result;
}

async function blockCurrentAuthor(unblock = false) {
  const author = await getCurrentAuthor();
  if (!author?.secUid) {
    showToast('未识别到当前视频作者，请先播放一个视频', 'error');
    return { success: false, error: '未找到作者' };
  }

  const shouldUnblock = typeof unblock === 'boolean' ? unblock : !!author.blocked;
  const result = await blockUserById(
    author.secUid,
    author.userId,
    author.nickname,
    shouldUnblock
  );

  return { ...result, author, unblocked: shouldUnblock };
}

function createFloatingButton() {
  if (document.getElementById('douyin-block-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'douyin-block-fab';
  fab.type = 'button';
  fab.title = '拉黑/解除拉黑当前作者 (Ctrl+Shift+B / Ctrl+Shift+U)';
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8V22h19.2v-2.8c0-3.2-6.4-4.8-9.6-4.8zm10.8-2.4 1.7 1.7-12 12-1.7-1.7 12-12z"/>
    </svg>
    <span>拉黑作者</span>
  `;

  fab.addEventListener('click', async () => {
    fab.disabled = true;
    fab.classList.add('is-loading');
    try {
      const author = await getCurrentAuthor();
      await blockCurrentAuthor(!!author?.blocked);
    } finally {
      fab.disabled = false;
      fab.classList.remove('is-loading');
    }
  });

  document.body.appendChild(fab);
}

function updateFloatingButton(blocked) {
  const fab = document.getElementById('douyin-block-fab');
  if (!fab) return;

  const label = fab.querySelector('span');
  if (blocked) {
    fab.classList.add('is-blocked');
    if (label) label.textContent = '解除拉黑';
    fab.title = '解除拉黑当前作者 (Ctrl+Shift+U)';
  } else {
    fab.classList.remove('is-blocked');
    if (label) label.textContent = '拉黑作者';
    fab.title = '拉黑当前作者 (Ctrl+Shift+B)';
  }
}

async function refreshFloatingButtonState() {
  try {
    const author = await getCurrentAuthor();
    if (author?.secUid) {
      updateFloatingButton(!!author.blocked);
    }
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'douyin-block-action') return;

  (async () => {
    try {
      if (message.action === 'get-author') {
        const author = await getCurrentAuthor();
        sendResponse({ ok: true, author });
        return;
      }

      if (message.action === 'block' || message.action === 'unblock') {
        const result = await blockCurrentAuthor(message.action === 'unblock');
        sendResponse({ ok: true, result });
        return;
      }

      if (message.action === 'block-by-id') {
        const result = await blockUserById(
          message.secUid,
          message.userId,
          message.nickname,
          !!message.unblock
        );
        sendResponse({ ok: true, result });
        return;
      }

      if (message.action === 'check-blocked') {
        const blocked = await BlacklistStorage.isBlocked(message.secUid);
        sendResponse({ ok: true, blocked });
        return;
      }

      sendResponse({ ok: false, error: '未知操作' });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || '操作失败' });
    }
  })();

  return true;
});

function init() {
  injectPageScript();
  createFloatingButton();
  refreshFloatingButtonState();

  setInterval(refreshFloatingButtonState, 5000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
