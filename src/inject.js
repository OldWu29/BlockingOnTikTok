/**
 * 运行在页面上下文，可访问抖音签名函数与 Cookie
 */
(function () {
  const SEC_UID_RE = /MS4wLj[A-Za-z0-9_\-]{15,}/;

  const awemeAuthorCache = new Map();

  function getDeviceParams() {
    const ua = navigator.userAgent;
    let browserName = 'Edge';
    let browserVersion = '120.0.0.0';

    const edgeMatch = ua.match(/Edg\/(\d+)/);
    const chromeMatch = ua.match(/Chrome\/(\d+)/);
    if (edgeMatch) {
      browserName = 'Edge';
      browserVersion = edgeMatch[1] + '.0.0.0';
    } else if (chromeMatch) {
      browserName = 'Chrome';
      browserVersion = chromeMatch[1] + '.0.0.0';
    }

    return {
      device_platform: 'webapp',
      aid: '6383',
      channel: 'channel_pc_web',
      pc_client_type: '1',
      version_code: '190500',
      version_name: '19.5.0',
      cookie_enabled: 'true',
      screen_width: String(screen.width),
      screen_height: String(screen.height),
      browser_language: navigator.language || 'zh-CN',
      browser_platform: navigator.platform || 'Win32',
      browser_name: browserName,
      browser_version: browserVersion,
      browser_online: 'true',
      engine_name: 'Blink',
      engine_version: browserVersion,
      os_name: 'Windows',
      os_version: '10',
      cpu_core_num: String(navigator.hardwareConcurrency || 8),
      device_memory: String(Math.ceil(navigator.deviceMemory || 8)),
      platform: 'PC',
      downlink: String(navigator.connection?.downlink || 10),
      effective_type: navigator.connection?.effectiveType || '4g',
      round_trip_time: String(navigator.connection?.rtt || 50)
    };
  }

  function readCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function generateMsToken() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for (let i = 0; i < 107; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  function signUrl(pathWithQuery) {
    const crawler = window._byted_acrawler || window.byted_acrawler;
    if (!crawler) return pathWithQuery;

    if (typeof crawler.signUrl === 'function') {
      try {
        return crawler.signUrl(pathWithQuery);
      } catch (_) {}
    }

    if (typeof crawler.sign === 'function') {
      try {
        const sign = crawler.sign(pathWithQuery);
        if (sign) {
          const sep = pathWithQuery.includes('?') ? '&' : '?';
          return pathWithQuery + sep + 'a_bogus=' + encodeURIComponent(sign);
        }
      } catch (_) {}
    }

    return pathWithQuery;
  }

  function buildBlockUrl() {
    const params = new URLSearchParams(getDeviceParams());
    const webid = readCookie('s_v_web_id');
    const uifid = readCookie('UIFID');
    const msToken = readCookie('msToken') || generateMsToken();

    if (webid) {
      params.set('webid', webid);
      params.set('verifyFp', webid);
      params.set('fp', webid);
    }
    if (uifid) params.set('uifid', uifid);
    params.set('msToken', msToken);

    return 'https://www-hj.douyin.com/aweme/v1/web/user/block/?' + params.toString();
  }

  function cacheAwemeAuthor(aweme) {
    if (!aweme?.author) return;
    const author = aweme.author;
    const secUid = author.sec_uid || author.secUid;
    if (!secUid) return;

    const info = {
      secUid,
      userId: author.uid || author.user_id || '',
      nickname: author.nickname || '',
      awemeId: aweme.aweme_id || aweme.awemeId || ''
    };

    if (info.awemeId) awemeAuthorCache.set(String(info.awemeId), info);
    awemeAuthorCache.set(secUid, info);
  }

  function walkJson(node, visitor) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item) => walkJson(item, visitor));
      return;
    }
    visitor(node);
    Object.values(node).forEach((value) => walkJson(value, visitor));
  }

  function extractAuthorsFromPayload(data) {
    walkJson(data, (obj) => {
      if (obj.aweme_list && Array.isArray(obj.aweme_list)) {
        obj.aweme_list.forEach(cacheAwemeAuthor);
      }
      if (obj.aweme_id && obj.author) {
        cacheAwemeAuthor(obj);
      }
    });
  }

  function hookFetch() {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const clone = response.clone();
        const contentType = clone.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await clone.json();
          extractAuthorsFromPayload(data);
        }
      } catch (_) {}
      return response;
    };
  }

  function hookXHR() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__douyinBlockUrl = String(url || '');
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener('load', function () {
        try {
          const contentType = this.getResponseHeader('content-type') || '';
          if (!contentType.includes('application/json')) return;
          const data = JSON.parse(this.responseText);
          extractAuthorsFromPayload(data);
        } catch (_) {}
      });
      return originalSend.apply(this, args);
    };
  }

  function postBlockRequest(url, bodyString) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reject(new Error('网络请求失败'));
      xhr.send(bodyString);
    });
  }

  async function blockUser(secUid, userId, unblock) {
    const blockType = unblock ? 0 : 1;
    let url = buildBlockUrl();

    const query = new URL(url).search;
    const signedPath = signUrl('/aweme/v1/web/user/block/' + query);
    if (signedPath.startsWith('http')) {
      url = signedPath;
    } else if (signedPath.startsWith('/')) {
      url = 'https://www-hj.douyin.com' + signedPath;
    }

    const body = new URLSearchParams({
      block_type: String(blockType),
      sec_user_id: secUid,
      source: '0'
    });
    if (userId) body.set('user_id', String(userId));

    const bodyString = body.toString();
    let response = await postBlockRequest(url, bodyString);

    if (response.status === 403) {
      const fallbackUrl = buildBlockUrl();
      response = await postBlockRequest(fallbackUrl, bodyString);
    }

    const text = response.text;
    if (!text) {
      return { success: false, error: '服务器返回空响应', status: response.status || 0 };
    }

    const data = JSON.parse(text);
    if (data.status_code !== 0) {
      return {
        success: false,
        error: data.status_msg || '操作失败',
        status: response.status,
        data
      };
    }

    const blocked = data.block_status === 1;
    return {
      success: unblock ? !blocked : blocked,
      blocked,
      nickname: data.user?.nickname || '',
      data
    };
  }

  function getAuthorFromDom() {
    const container = findActiveVideoContainer();
    if (!container) return null;

    const link = container.querySelector('a[href*="/user/"]');
    if (link) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/\/user\/([^?/#]+)/) || href.match(SEC_UID_RE);
      if (match) {
        const secUid = match[1].includes('MS4wLj') ? match[1] : match[0];
        const nickname =
          link.getAttribute('title') ||
          link.textContent?.trim() ||
          container.querySelector('[data-e2e="video-author-name"]')?.textContent?.trim() ||
          '';
        const cached = awemeAuthorCache.get(secUid);
        return {
          secUid,
          userId: cached?.userId || '',
          nickname: nickname || cached?.nickname || '未知作者',
          source: 'dom'
        };
      }
    }

    const dataSecUid =
      container.getAttribute('data-sec-uid') ||
      container.querySelector('[data-sec-uid]')?.getAttribute('data-sec-uid');
    if (dataSecUid && SEC_UID_RE.test(dataSecUid)) {
      const cached = awemeAuthorCache.get(dataSecUid);
      return {
        secUid: dataSecUid,
        userId: cached?.userId || '',
        nickname: cached?.nickname || '未知作者',
        source: 'dom-data'
      };
    }

    return null;
  }

  function findActiveVideoContainer() {
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
      if (video.paused && video.currentTime <= 0) continue;
      const rect = video.getBoundingClientRect();
      if (rect.height < 100) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

      let parent = video.parentElement;
      for (let depth = 0; parent && depth < 12; depth++) {
        if (parent.querySelector('[data-e2e="video-player-digg"], a[href*="/user/"]')) {
          return parent;
        }
        parent = parent.parentElement;
      }
    }

    const diggButtons = document.querySelectorAll('[data-e2e="video-player-digg"]');
    for (const diggBtn of diggButtons) {
      const rect = diggBtn.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.2 || rect.top > window.innerHeight * 0.85) continue;
      let parent = diggBtn.parentElement;
      for (let depth = 0; parent && depth < 12; depth++) {
        if (parent.querySelector('video, a[href*="/user/"]')) return parent;
        parent = parent.parentElement;
      }
    }

    return null;
  }

  function getAuthorFromVideoPage() {
    const match = location.pathname.match(/\/video\/(\d+)/);
    if (!match) return null;

    const awemeId = match[1];
    if (awemeAuthorCache.has(awemeId)) {
      return { ...awemeAuthorCache.get(awemeId), source: 'cache' };
    }

    const renderData = document.getElementById('RENDER_DATA');
    if (renderData?.textContent) {
      try {
        const json = JSON.parse(decodeURIComponent(renderData.textContent));
        let found = null;
        walkJson(json, (obj) => {
          if (found) return;
          if (obj.aweme_detail?.author) {
            cacheAwemeAuthor(obj.aweme_detail);
            found = awemeAuthorCache.get(awemeId) || null;
          }
        });
        if (found) return { ...found, source: 'render-data' };
      } catch (_) {}
    }

    const userLink = document.querySelector('a[href*="/user/"]');
    if (userLink) {
      const href = userLink.getAttribute('href') || '';
      const secMatch = href.match(/\/user\/([^?/#]+)/);
      if (secMatch) {
        return {
          secUid: secMatch[1],
          userId: '',
          nickname: userLink.textContent?.trim() || '未知作者',
          source: 'video-page'
        };
      }
    }

    return null;
  }

  function getCurrentAuthor() {
    return getAuthorFromDom() || getAuthorFromVideoPage();
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'douyin-block-extension') {
      return;
    }

    const { action, requestId, payload } = event.data;

    try {
      if (action === 'get-author') {
        const author = getCurrentAuthor();
        window.postMessage(
          { source: 'douyin-block-extension', action: 'get-author-result', requestId, author },
          '*'
        );
        return;
      }

      if (action === 'block-user') {
        const { secUid, userId, unblock } = payload || {};
        if (!secUid) {
          window.postMessage(
            {
              source: 'douyin-block-extension',
              action: 'block-user-result',
              requestId,
              result: { success: false, error: '未找到作者信息' }
            },
            '*'
          );
          return;
        }

        const result = await blockUser(secUid, userId, !!unblock);
        window.postMessage(
          { source: 'douyin-block-extension', action: 'block-user-result', requestId, result },
          '*'
        );
      }
    } catch (error) {
      window.postMessage(
        {
          source: 'douyin-block-extension',
          action: action === 'get-author' ? 'get-author-result' : 'block-user-result',
          requestId,
          author: null,
          result: { success: false, error: error.message || '未知错误' }
        },
        '*'
      );
    }
  });

  hookFetch();
  hookXHR();
})();
