const blacklistEl = document.getElementById('blacklist');
const emptyStateEl = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const countBadgeEl = document.getElementById('count-badge');
const statusEl = document.getElementById('status');
const refreshBtn = document.getElementById('refresh-btn');
const clearBtn = document.getElementById('clear-btn');

let allItems = [];

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ' is-' + type : '');
}

function formatTime(timestamp) {
  if (!timestamp) return '未知时间';
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1200);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function ensureDouyinTab() {
  const tabs = await chrome.tabs.query({ url: ['https://www.douyin.com/*', 'https://live.douyin.com/*'] });
  if (tabs.length > 0) return tabs[0];

  const tab = await chrome.tabs.create({ url: 'https://www.douyin.com', active: false });
  await waitForTabComplete(tab.id);
  return tab;
}

async function unblockOnDouyin(user) {
  const tab = await ensureDouyinTab();

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'douyin-block-action',
      action: 'block-by-id',
      secUid: user.secUid,
      userId: user.userId,
      unblock: true
    });

    if (!response?.ok) {
      throw new Error(response?.error || '解除拉黑失败');
    }

    if (!response.result?.success) {
      throw new Error(response.result?.error || '解除拉黑失败，请确认已登录抖音');
    }

    await BlacklistStorage.remove(user.secUid);
    return true;
  } catch (error) {
    if (String(error.message).includes('Receiving end does not exist')) {
      await waitForTabComplete(tab.id);
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'douyin-block-action',
        action: 'block-by-id',
        secUid: user.secUid,
        userId: user.userId,
        unblock: true
      });

      if (!response?.ok || !response.result?.success) {
        throw new Error(response?.result?.error || response?.error || '解除拉黑失败');
      }

      await BlacklistStorage.remove(user.secUid);
      return true;
    }

    throw error;
  }
}

function renderList(items) {
  blacklistEl.innerHTML = '';
  const visibleItems = items.filter((item) => {
    const keyword = searchInput.value.trim().toLowerCase();
    if (!keyword) return true;
    return (
      (item.nickname || '').toLowerCase().includes(keyword) ||
      (item.secUid || '').toLowerCase().includes(keyword)
    );
  });

  countBadgeEl.textContent = `${items.length} 人`;
  emptyStateEl.classList.toggle('hidden', visibleItems.length > 0);

  if (visibleItems.length === 0) return;

  visibleItems.forEach((user) => {
    const li = document.createElement('li');
    li.className = 'blacklist-item';

    const info = document.createElement('div');
    info.className = 'user-info';
    info.innerHTML = `
      <div class="user-name">${escapeHtml(user.nickname || '未知用户')}</div>
      <div class="user-meta">${escapeHtml(user.secUid || '')}</div>
      <div class="user-meta">拉黑时间：${formatTime(user.blockedAt)}</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'ghost-btn';
    openBtn.type = 'button';
    openBtn.textContent = '打开主页';
    openBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: `https://www.douyin.com/user/${user.secUid}` });
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'ghost-btn';
    removeBtn.type = 'button';
    removeBtn.textContent = '仅删记录';
    removeBtn.addEventListener('click', async () => {
      if (!confirm(`仅从本地删除「${user.nickname}」的记录？\n（不会自动在抖音解除拉黑）`)) return;
      await BlacklistStorage.remove(user.secUid);
      setStatus(`已删除本地记录：${user.nickname}`, 'success');
      await loadList();
    });

    const unblockBtn = document.createElement('button');
    unblockBtn.className = 'unblock-btn';
    unblockBtn.type = 'button';
    unblockBtn.textContent = '解除拉黑';
    unblockBtn.addEventListener('click', async () => {
      unblockBtn.disabled = true;
      setStatus(`正在解除拉黑：${user.nickname}...`);
      try {
        await unblockOnDouyin(user);
        setStatus(`已解除拉黑：${user.nickname}`, 'success');
        await loadList();
      } catch (error) {
        setStatus(error.message || '解除拉黑失败', 'error');
      } finally {
        unblockBtn.disabled = false;
      }
    });

    actions.append(openBtn, removeBtn, unblockBtn);
    li.append(info, actions);
    blacklistEl.appendChild(li);
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadList() {
  allItems = await BlacklistStorage.getList();
  renderList(allItems);
}

refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  try {
    await loadList();
    setStatus('列表已刷新', 'success');
  } finally {
    refreshBtn.disabled = false;
  }
});

clearBtn.addEventListener('click', async () => {
  if (!allItems.length) {
    setStatus('黑名单为空');
    return;
  }

  if (
    !confirm(
      '确定清空所有本地黑名单记录？\n这不会自动在抖音解除拉黑，仅删除本扩展保存的记录。'
    )
  ) {
    return;
  }

  clearBtn.disabled = true;
  try {
    await BlacklistStorage.clear();
    await loadList();
    setStatus('已清空本地黑名单记录', 'success');
  } finally {
    clearBtn.disabled = false;
  }
});

searchInput.addEventListener('input', () => renderList(allItems));

loadList();
