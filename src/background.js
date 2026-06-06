chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('douyin.com')) return;

  const action = command === 'unblock-author' ? 'unblock' : 'block';

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'douyin-block-action',
      action
    });
  } catch (_) {
    // 页面未加载 content script 时忽略
  }
});
