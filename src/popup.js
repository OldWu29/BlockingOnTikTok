const authorNameEl = document.getElementById('author-name');
const authorIdEl = document.getElementById('author-id');
const blockedBadgeEl = document.getElementById('blocked-badge');
const blockBtn = document.getElementById('block-btn');
const unblockBtn = document.getElementById('unblock-btn');
const refreshBtn = document.getElementById('refresh-btn');
const manageBtn = document.getElementById('manage-btn');
const statusEl = document.getElementById('status');

let currentAuthor = null;

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
  if (!tab.url?.includes('douyin.com')) {
    throw new Error('请先打开抖音网页版');
  }

  return chrome.tabs.sendMessage(tab.id, {
    type: 'douyin-block-action',
    action,
    ...extra
  });
}

function renderAuthor(author) {
  currentAuthor = author || null;

  if (!author?.secUid) {
    authorNameEl.textContent = '未识别到作者';
    authorIdEl.textContent = '请确保正在播放视频，然后点击刷新';
    blockedBadgeEl.classList.add('hidden');
    blockBtn.classList.remove('hidden');
    unblockBtn.classList.add('hidden');
    blockBtn.disabled = true;
    unblockBtn.disabled = true;
    return;
  }

  authorNameEl.textContent = author.nickname || '未知作者';
  authorIdEl.textContent = author.secUid;

  if (author.blocked) {
    blockedBadgeEl.classList.remove('hidden');
    blockBtn.classList.add('hidden');
    unblockBtn.classList.remove('hidden');
    blockBtn.disabled = true;
    unblockBtn.disabled = false;
  } else {
    blockedBadgeEl.classList.add('hidden');
    blockBtn.classList.remove('hidden');
    unblockBtn.classList.add('hidden');
    blockBtn.disabled = false;
    unblockBtn.disabled = true;
  }
}

async function refreshAuthor() {
  setStatus('正在识别作者...');
  refreshBtn.disabled = true;
  blockBtn.disabled = true;
  unblockBtn.disabled = true;

  try {
    const response = await sendToContent('get-author');
    if (!response?.ok) throw new Error(response?.error || '获取作者失败');
    renderAuthor(response.author);
    setStatus(response.author ? '作者信息已更新' : '未识别到作者', response.author ? 'success' : 'error');
  } catch (error) {
    renderAuthor(null);
    setStatus(error.message || '获取失败', 'error');
  } finally {
    refreshBtn.disabled = false;
  }
}

async function blockAuthor() {
  setStatus('正在拉黑...');
  blockBtn.disabled = true;
  refreshBtn.disabled = true;

  try {
    const response = await sendToContent('block');
    if (!response?.ok) throw new Error(response?.error || '拉黑失败');

    const result = response.result;
    if (result?.success) {
      setStatus(`已拉黑：${result.author?.nickname || '该用户'}`, 'success');
    } else {
      setStatus(result?.error || '拉黑失败，请确认已登录', 'error');
    }
  } catch (error) {
    setStatus(error.message || '拉黑失败', 'error');
  } finally {
    refreshBtn.disabled = false;
    refreshAuthor();
  }
}

async function unblockAuthor() {
  setStatus('正在解除拉黑...');
  unblockBtn.disabled = true;
  refreshBtn.disabled = true;

  try {
    const response = await sendToContent('unblock');
    if (!response?.ok) throw new Error(response?.error || '解除拉黑失败');

    const result = response.result;
    if (result?.success) {
      setStatus(`已解除拉黑：${result.author?.nickname || '该用户'}`, 'success');
    } else {
      setStatus(result?.error || '解除拉黑失败，请确认已登录', 'error');
    }
  } catch (error) {
    setStatus(error.message || '解除拉黑失败', 'error');
  } finally {
    refreshBtn.disabled = false;
    refreshAuthor();
  }
}

blockBtn.addEventListener('click', blockAuthor);
unblockBtn.addEventListener('click', unblockAuthor);
refreshBtn.addEventListener('click', refreshAuthor);
manageBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

refreshAuthor();
