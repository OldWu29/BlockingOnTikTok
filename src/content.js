const MESSAGE_SOURCE = 'douyin-block-extension';
const RETRY_HINT = '请等待 1～2 秒后重试';
let injectReady = false;
let requestCounter = 0;
let refreshInFlight = false;
let lastRefreshAt = 0;

function formatFailureMessage(message, fallback = '操作失败，请确认已登录抖音') {
  const text = (message || fallback).replace(/[。．.!！]+$/, '');
  if (text.includes('1～2 秒') || text.includes('1-2')) return text;
  return `${text}。${RETRY_HINT}`;
}

function injectPageScript() {
  if (document.getElementById('douyin-block-inject')) return;

  const loadScript = (src, id, onLoad) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = chrome.runtime.getURL(src);
    script.onload = () => {
      script.remove();
      if (onLoad) onLoad();
    };
    (document.head || document.documentElement).appendChild(script);
  };

  loadScript('src/user-info.js', 'douyin-block-user-info', () => {
    loadScript('src/inject.js', 'douyin-block-inject', () => {
      injectReady = true;
    });
  });
}

async function ensureInjectReady() {
  if (injectReady) return;
  injectPageScript();
  for (let i = 0; i < 30; i++) {
    if (injectReady) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function callPage(action, payload) {
  return new Promise((resolve, reject) => {
    const requestId = ++requestCounter;
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('请求超时，请刷新页面后重试'));
    }, 20000);

    function onMessage(event) {
      if (event.source !== window || !event.data || event.data.source !== MESSAGE_SOURCE) return;
      if (event.data.requestId !== requestId) return;

      const resultAction =
        action === 'get-author'
          ? 'get-author-result'
          : action === 'fetch-user-nickname'
            ? 'fetch-user-nickname-result'
            : 'block-user-result';
      if (event.data.action !== resultAction) return;

      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);

      if (action === 'get-author') {
        resolve(event.data.author || null);
      } else if (action === 'fetch-user-nickname') {
        resolve(event.data.result || { nickname: '' });
      } else {
        resolve(event.data.result || { success: false, error: '无响应' });
      }
    }

    window.addEventListener('message', onMessage);
    window.postMessage({ source: MESSAGE_SOURCE, action, requestId, payload }, '*');
  });
}

UserInfoUtil.registerPageBridge({
  callPage,
  ensureInjectReady
});

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

async function getNicknameFromPageDom() {
  const pick = (text) => String(text || '').replace(/^@/, '').trim().split(/[·•\s]/)[0].trim();

  const selectors = [
    '[data-e2e="video-author-name"]',
    '[data-e2e="live-avatar"]',
    'a[data-e2e="video-avatar"]'
  ];
  for (const selector of selectors) {
    const text = pick(document.querySelector(selector)?.textContent);
    if (text && !UserInfoUtil.isGenericNickname(text)) return text;
  }

  const desc = document.querySelector('[data-e2e="video-desc"]')?.textContent || '';
  const atMatch = desc.match(/@([^\s·•]+)/);
  if (atMatch?.[1] && !UserInfoUtil.isGenericNickname(atMatch[1])) return atMatch[1].trim();

  return '';
}

async function resolveAuthorFallback(wantUnblock) {
  const fab = document.getElementById('douyin-block-fab');
  const fabSecUid = fab?.dataset?.secUid || '';
  if (fabSecUid) {
    const fromFab = await UserInfoUtil.getBySecUid(fabSecUid);
    if (fromFab?.isValid()) {
      return await UserInfoUtil.enrichBlockedState(
        fromFab.clone({ userId: fab?.dataset?.userId || fromFab.userId })
      );
    }
  }

  const nickname = await getNicknameFromPageDom();
  if (nickname && typeof BlacklistStorage !== 'undefined') {
    const list = await BlacklistStorage.getList();
    const match = list.find((item) => {
      const name = String(item.nickname || '').trim();
      return name === nickname || name.includes(nickname) || nickname.includes(name);
    });
    if (match) return await UserInfoUtil.enrichBlockedState(UserInfoUtil.from(match));
  }

  const current = UserInfoUtil.getCurrent();
  if (current?.isValid()) {
    return await UserInfoUtil.enrichBlockedState(current);
  }

  if (wantUnblock && nickname && typeof BlacklistStorage !== 'undefined') {
    const list = await BlacklistStorage.getList();
    if (list.length === 1) {
      return await UserInfoUtil.enrichBlockedState(UserInfoUtil.from(list[0]));
    }
  }

  return null;
}

async function getCurrentAuthor(force = false) {
  return UserInfoUtil.fetchCurrentAuthor({ force });
}

async function blockCurrentAuthor(unblock) {
  let plan = await UserInfoUtil.blockOrUnblockCurrent(unblock);
  let author = plan.author;

  if (!author?.isValid()) {
    const explicitUnblock = typeof unblock === 'boolean' ? unblock : undefined;
    author = await resolveAuthorFallback(explicitUnblock === true);
    if (author?.isValid()) {
      const shouldUnblock =
        explicitUnblock !== undefined ? explicitUnblock : author.blocked;
      plan = { author, shouldUnblock };
      UserInfoUtil.setCurrent(author);
    }
  }

  if (!author?.isValid()) {
    showToast(formatFailureMessage('未识别到作者，若对方正在直播请稍候', '未识别到作者'), 'error');
    return { success: false, error: '未找到作者' };
  }

  updateFloatingButton(author);

  const result = await blockUserById(
    author.secUid,
    author.userId,
    author.nickname,
    plan.shouldUnblock
  );

  const current = UserInfoUtil.getCurrent();
  return {
    ...result,
    author: current?.toPlainObject() || author.toPlainObject(),
    unblocked: plan.shouldUnblock
  };
}

async function blockUserById(secUid, userId, nickname, unblock = false) {
  const user = UserInfoUtil.from({ secUid, userId, nickname });
  const result = await callPage('block-user', {
    secUid: user.secUid,
    userId: user.userId,
    unblock
  });

  if (result.success) {
    const displayName = await UserInfoUtil.resolveDisplayName(user, result.nickname);

    if (unblock) {
      await BlacklistStorage.remove(user.secUid);
      showToast(`已解除拉黑：${displayName}`, 'success');
    } else {
      await BlacklistStorage.add(user.clone({ nickname: displayName }));
      showToast(`已拉黑：${displayName}`, 'success');
    }

    const current = UserInfoUtil.getCurrent();
    if (current?.secUid === user.secUid) {
      current.blocked = !unblock;
      UserInfoUtil.setCurrent(current);
      updateFloatingButton(current);
    }
  } else {
    showToast(formatFailureMessage(result.error), 'error');
  }

  return result;
}

function createFloatingButton() {
  if (document.getElementById('douyin-block-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'douyin-block-fab';
  fab.type = 'button';
  fab.title = '切换拉黑状态 (Ctrl+Shift+B / Ctrl+Shift+U)';
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8V22h19.2v-2.8c0-3.2-6.4-4.8-9.6-4.8zm10.8-2.4 1.7 1.7-12 12-1.7-1.7 12-12z"/>
    </svg>
    <span>切换拉黑状态</span>
  `;

  fab.addEventListener('click', async () => {
    fab.disabled = true;
    fab.classList.add('is-loading');
    try {
      showToast('正在识别作者...', 'info');
      await blockCurrentAuthor();
    } finally {
      fab.disabled = false;
      fab.classList.remove('is-loading');
    }
  });

  document.body.appendChild(fab);
}

function updateFloatingButton(author) {
  const fab = document.getElementById('douyin-block-fab');
  if (!fab) return;

  const info = author ? UserInfoUtil.from(author) : null;
  if (info?.isValid()) {
    fab.dataset.secUid = info.secUid;
    fab.dataset.userId = info.userId || '';
  }

  const label = fab.querySelector('span');
  if (label) label.textContent = '切换拉黑状态';
  fab.title = '切换拉黑状态 (Ctrl+Shift+B / Ctrl+Shift+U)';
}

async function refreshFloatingButtonState(force = false) {
  const now = Date.now();
  if (!force) {
    if (refreshInFlight || now - lastRefreshAt < 8000) return;
    if (document.hidden) return;
  }

  refreshInFlight = true;
  lastRefreshAt = now;

  try {
    const author = await getCurrentAuthor();
    if (author?.isValid()) {
      updateFloatingButton(author);
    }
  } catch (_) {
  } finally {
    refreshInFlight = false;
  }
}

function setupLazyRefresh() {
  let scrollTimer = null;

  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => refreshFloatingButtonState(false), 1200);
    },
    { passive: true }
  );

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshFloatingButtonState(false);
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'douyin-block-action') return;

  (async () => {
    try {
      if (message.action === 'get-author') {
        const author = await getCurrentAuthor(true);
        sendResponse({ ok: true, author: author?.toPlainObject() || null });
        return;
      }

      if (message.action === 'toggle') {
        const result = await blockCurrentAuthor();
        sendResponse({ ok: true, result });
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
  setupLazyRefresh();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
