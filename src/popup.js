const authorNameEl = document.getElementById('author-name');
const authorIdEl = document.getElementById('author-id');
const blockedBadgeEl = document.getElementById('blocked-badge');
const toggleBtn = document.getElementById('toggle-btn');
const refreshBtn = document.getElementById('refresh-btn');
const manageBtn = document.getElementById('manage-btn');
const statusEl = document.getElementById('status');

let currentAuthor = null;

const RETRY_HINT = '请等待 1～2 秒后重试';

function formatFailureMessage(message, fallback) {
  const text = (message || fallback).replace(/[。．.!！]+$/, '');
  if (text.includes('1～2 秒') || text.includes('1-2')) return text;
  return `${text}。${RETRY_HINT}`;
}

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ' is-' + type : '');
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToContent(action, extra = {}) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error('未找到当前标签页');
  if (!/douyin\.com/.test(tab.url || '')) {
    throw new Error('请先打开抖音网页版或直播间');
  }

  return chrome.tabs.sendMessage(tab.id, {
    type: 'douyin-block-action',
    action,
    ...extra
  });
}

function renderAuthor(authorData) {
  const author = authorData ? UserInfoUtil.from(authorData) : null;
  currentAuthor = author?.isValid() ? author : null;

  if (!currentAuthor) {
    authorNameEl.textContent = '未识别到作者';
    authorIdEl.textContent = '请确保正在播放视频，然后点击刷新';
    blockedBadgeEl.classList.add('hidden');
    toggleBtn.disabled = true;
    return;
  }

  authorNameEl.textContent = currentAuthor.getDisplayName('未知作者');
  authorIdEl.textContent = currentAuthor.secUid;
  toggleBtn.textContent = '切换拉黑状态';
  toggleBtn.disabled = false;

  if (currentAuthor.blocked) {
    blockedBadgeEl.classList.remove('hidden');
  } else {
    blockedBadgeEl.classList.add('hidden');
  }
}

async function refreshAuthor() {
  setStatus('正在识别作者...');
  refreshBtn.disabled = true;
  toggleBtn.disabled = true;

  try {
    const response = await sendToContent('get-author');
    if (!response?.ok) throw new Error(response?.error || '获取作者失败');
    renderAuthor(response.author);
    setStatus(
      response.author ? '作者信息已更新' : formatFailureMessage('未识别到作者'),
      response.author ? 'success' : 'error'
    );
  } catch (error) {
    renderAuthor(null);
    setStatus(formatFailureMessage(error.message, '获取失败'), 'error');
  } finally {
    refreshBtn.disabled = false;
    if (currentAuthor) toggleBtn.disabled = false;
  }
}

async function toggleBlockState() {
  setStatus('正在识别作者...');
  toggleBtn.disabled = true;
  refreshBtn.disabled = true;

  try {
    const response = await sendToContent('toggle');
    if (!response?.ok) throw new Error(response?.error || '操作失败');

    const result = response.result;
    if (result?.success) {
      const author = UserInfoUtil.from(result.author);
      const actionText = result.unblocked ? '已解除拉黑' : '已拉黑';
      setStatus(`${actionText}：${author.getDisplayName()}`, 'success');
    } else {
      setStatus(formatFailureMessage(result?.error, '操作失败，请确认已登录'), 'error');
    }
  } catch (error) {
    setStatus(formatFailureMessage(error.message, '操作失败'), 'error');
  } finally {
    refreshBtn.disabled = false;
    refreshAuthor();
  }
}

toggleBtn.addEventListener('click', toggleBlockState);
refreshBtn.addEventListener('click', refreshAuthor);
manageBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

refreshAuthor();
