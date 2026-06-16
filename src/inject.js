/**
 * 运行在页面上下文，可访问抖音签名函数与 Cookie
 */
(function () {
  const SEC_UID_RE = /MS4wLj[A-Za-z0-9_\-]{15,}/;
  const GENERIC_NICKNAMES = new Set(['未知作者', '未知用户', '主播', '该用户']);

  function isGenericNickname(name) {
    const value = String(name || '').trim();
    return !value || GENERIC_NICKNAMES.has(value);
  }

  function pickNickname(secUid, ...candidates) {
    for (const name of candidates) {
      if (!isGenericNickname(name)) return String(name).trim();
    }
    if (secUid) {
      const cached = awemeAuthorCache.get(secUid) || liveAuthorCache.get(secUid);
      if (cached?.nickname && !isGenericNickname(cached.nickname)) {
        return cached.nickname;
      }
    }
    for (const name of candidates) {
      if (name && String(name).trim()) return String(name).trim();
    }
    return '该用户';
  }

  function getNicknameFromContainer(container) {
    if (!container) return '';
    const selectors = [
      '[data-e2e="video-author-name"]',
      '[data-e2e="live-avatar"]',
      'a[data-e2e="video-avatar"]'
    ];
    for (const selector of selectors) {
      const el = container.querySelector(selector);
      const text = el?.textContent?.replace(/^@/, '').trim();
      if (text && !isGenericNickname(text)) return text;
    }
    return '';
  }

  function enrichAuthor(author, container) {
    if (!author?.secUid) return author;
    author.nickname = pickNickname(
      author.secUid,
      author.nickname,
      getNicknameFromContainer(container)
    );
    return author;
  }

  function extractNicknameFromBlockResponse(data) {
    if (!data || typeof data !== 'object') return '';
    const user = data.user || data.user_info || data.block_user;
    if (user) {
      const name = user.nickname || user.nick_name || user.name;
      if (name) return name;
    }
    return '';
  }

  const awemeAuthorCache = new Map();
  const liveAuthorCache = new Map();
  const MAX_CACHE_SIZE = 200;
  const MAX_JSON_BYTES = 512 * 1024;
  const NETWORK_URL_RE =
    /aweme\/v1\/web\/(aweme|feed|recommend|module|history|tab)|webcast\/room\/web\/(enter|info)|webcast\/user\/profile/i;

  let payloadQueue = [];
  let payloadDrainScheduled = false;

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

    const roomId =
      aweme.cell_room?.room_id ||
      aweme.cell_room?.id ||
      aweme.room_id ||
      author.room_id ||
      author.room_id_str ||
      '';

    const info = {
      secUid,
      userId: author.uid || author.user_id || author.id || '',
      nickname: author.nickname || '',
      awemeId: aweme.aweme_id || aweme.awemeId || '',
      roomId: roomId ? String(roomId) : '',
      isLive: !!(roomId || aweme.cell_room || aweme.live_room || author.live_status)
    };

    if (info.awemeId) awemeAuthorCache.set(String(info.awemeId), info);
    awemeAuthorCache.set(secUid, info);
    trimCache(awemeAuthorCache);
    if (roomId) cacheLiveAuthor(author, roomId);
  }

  function trimCache(map) {
    if (map.size <= MAX_CACHE_SIZE) return;
    const extra = map.size - MAX_CACHE_SIZE;
    const keys = map.keys();
    for (let i = 0; i < extra; i++) {
      const next = keys.next();
      if (next.done) break;
      map.delete(next.value);
    }
  }

  function cacheLiveAuthor(user, roomId) {
    if (!user || typeof user !== 'object') return;
    const secUid = user.sec_uid || user.secUid || user.sec_user_id || user.secUserId;
    if (!secUid || !SEC_UID_RE.test(secUid)) return;

    const info = {
      secUid,
      userId: user.uid || user.user_id || user.id || user.id_str || '',
      nickname: user.nickname || user.nick_name || user.name || '主播',
      roomId: roomId || user.room_id || user.roomId || '',
      isLive: true
    };

    liveAuthorCache.set(secUid, info);
    if (info.roomId) liveAuthorCache.set(String(info.roomId), info);
    trimCache(liveAuthorCache);
  }

  function shouldProcessNetworkUrl(url) {
    return NETWORK_URL_RE.test(String(url || ''));
  }

  function getFetchRequestUrl(args) {
    const input = args[0];
    if (typeof input === 'string') return input;
    if (input instanceof Request) return input.url;
    return '';
  }

  function schedulePayloadProcess(data) {
    if (!data || typeof data !== 'object') return;
    payloadQueue.push(data);
    if (payloadDrainScheduled) return;
    payloadDrainScheduled = true;

    const drain = () => {
      const batch = payloadQueue.splice(0, 2);
      for (const item of batch) {
        extractAuthorsFromPayload(item);
      }
      if (payloadQueue.length) {
        const scheduler = window.requestIdleCallback || ((cb) => setTimeout(cb, 32));
        scheduler(drain);
      } else {
        payloadDrainScheduled = false;
      }
    };

    const scheduler = window.requestIdleCallback || ((cb) => setTimeout(cb, 16));
    scheduler(drain);
  }

  function extractAuthorsFromPayload(data) {
    if (!data || typeof data !== 'object') return;

    const lists = [data.aweme_list, data.data?.aweme_list, data.data?.data];
    for (const list of lists) {
      if (Array.isArray(list)) {
        for (let i = 0; i < list.length; i++) {
          cacheAwemeAuthor(list[i]);
        }
      }
    }

    if (data.aweme_detail?.author) cacheAwemeAuthor(data.aweme_detail);
    if (data.aweme_id && data.author) cacheAwemeAuthor(data);
    if (data.data?.aweme_detail?.author) cacheAwemeAuthor(data.data.aweme_detail);

    const roomUser = data.data?.user || data.data?.owner;
    if (roomUser) {
      cacheLiveAuthor(roomUser, data.data?.room_id || roomUser.room_id);
    }

    if (data.user_profile?.base_info) {
      cacheLiveAuthor(data.user_profile.base_info);
    }
  }

  function processResponseText(url, text) {
    if (!shouldProcessNetworkUrl(url)) return;
    if (!text || text.length > MAX_JSON_BYTES) return;
    if (!text.includes('aweme') && !text.includes('sec_uid') && !text.includes('room_id')) {
      return;
    }

    try {
      schedulePayloadProcess(JSON.parse(text));
    } catch (_) {}
  }

  function hookFetch() {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const requestUrl = getFetchRequestUrl(args);
      const shouldTrack = shouldProcessNetworkUrl(requestUrl);
      const response = await originalFetch.apply(this, args);

      if (shouldTrack) {
        response
          .clone()
          .text()
          .then((text) => processResponseText(requestUrl, text))
          .catch(() => {});
      }

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
      const requestUrl = this.__douyinBlockUrl || '';
      const shouldTrack = shouldProcessNetworkUrl(requestUrl);

      if (shouldTrack) {
        this.addEventListener('load', function onLoad() {
          this.removeEventListener('load', onLoad);
          try {
            const contentType = this.getResponseHeader('content-type') || '';
            if (!contentType.includes('json')) return;
            processResponseText(requestUrl, this.responseText);
          } catch (_) {}
        });
      }

      return originalSend.apply(this, args);
    };
  }

  function findAwemeDetailInRender(json) {
    if (!json || typeof json !== 'object') return null;
    if (json.aweme_detail?.author) return json.aweme_detail;

    for (const value of Object.values(json)) {
      if (!value || typeof value !== 'object') continue;
      if (value.aweme_detail?.author) return value.aweme_detail;
      if (value.aweme?.detail?.author) return value.aweme.detail;
    }

    return null;
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
    const nickname = pickNickname(secUid, extractNicknameFromBlockResponse(data));
    if (!isGenericNickname(nickname) && secUid) {
      const cached = awemeAuthorCache.get(secUid) || liveAuthorCache.get(secUid) || {};
      awemeAuthorCache.set(secUid, { ...cached, secUid, nickname, userId: cached.userId || userId || '' });
    }
    return {
      success: unblock ? !blocked : blocked,
      blocked,
      nickname,
      data
    };
  }

  const roomFetchCache = new Map();

  function getBrowserVersion() {
    const ua = navigator.userAgent;
    const edgeMatch = ua.match(/Edg\/(\d+)/);
    if (edgeMatch) return edgeMatch[1] + '.0.0.0';
    const chromeMatch = ua.match(/Chrome\/(\d+)/);
    if (chromeMatch) return chromeMatch[1] + '.0.0.0';
    return '120.0.0.0';
  }

  function normalizeHref(href) {
    const value = String(href || '');
    if (value.startsWith('//')) return 'https:' + value;
    return value;
  }

  function extractRoomIdFromHref(href) {
    const url = normalizeHref(href);
    if (!url) return null;

    const patterns = [
      /room_id=(\d+)/i,
      /room_id_str=(\d+)/i,
      /web_rid=(\d+)/i,
      /live\.douyin\.com\/(\d+)/i,
      /live\.douyin\.com\/[^?]*[?&]room_id=(\d+)/i
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) return match[1];
    }

    return null;
  }

  function extractRoomIdFromContainer(container) {
    if (!container) return null;

    const attrRoomId =
      container.getAttribute('data-live-room-id') ||
      container.getAttribute('data-room-id') ||
      container.querySelector('[data-live-room-id]')?.getAttribute('data-live-room-id') ||
      container.querySelector('[data-room-id]')?.getAttribute('data-room-id');

    if (attrRoomId) return String(attrRoomId);

    const selectors = [
      'a[data-e2e="video-avatar"]',
      'a[href*="live.douyin.com"]',
      'a[href*="room_id"]',
      'a[href]'
    ];

    for (const selector of selectors) {
      const links = container.querySelectorAll(selector);
      for (const link of links) {
        const roomId = extractRoomIdFromHref(link.getAttribute('href') || '');
        if (roomId) return roomId;
      }
    }

    return null;
  }

  function extractAuthorFromReactFiber(startEl) {
    if (!startEl) return null;

    const fiberKey = Object.keys(startEl).find(
      (key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
    );
    if (!fiberKey) return null;

    let node = startEl[fiberKey];
    for (let depth = 0; node && depth < 28; depth++) {
      const props = node.memoizedProps || node.pendingProps;
      if (!props) {
        node = node.return;
        continue;
      }

      const candidates = [
        props.awemeInfo,
        props.aweme,
        props.item?.awemeInfo,
        props.item?.aweme,
        props.videoInfo?.awemeInfo,
        props.data?.awemeInfo
      ];

      for (const aweme of candidates) {
        if (!aweme?.author) continue;
        cacheAwemeAuthor(aweme);
        const author = aweme.author;
        const secUid = author.sec_uid || author.secUid;
        if (!secUid) continue;

        return {
          secUid,
          userId: author.uid || author.user_id || author.id || '',
          nickname: pickNickname(secUid, author.nickname),
          awemeId: aweme.aweme_id || aweme.awemeId || '',
          isLive: !!(author.room_id || aweme.cell_room || author.live_status),
          source: 'react-fiber-aweme'
        };
      }

      const user = props.author || props.user || props.owner || props.userInfo;
      if (user) {
        const secUid = user.sec_uid || user.secUid;
        if (secUid && SEC_UID_RE.test(secUid)) {
          cacheLiveAuthor(user);
          return {
            secUid,
            userId: user.uid || user.user_id || user.id || '',
            nickname: pickNickname(secUid, user.nickname, user.nick_name, user.name),
            isLive: true,
            source: 'react-fiber-user'
          };
        }
      }

      node = node.return;
    }

    return null;
  }

  function guessAuthorFromNickname(container) {
    if (!container) return null;

    const nickname =
      container.querySelector('[data-e2e="video-author-name"]')?.textContent?.replace(/^@/, '').trim() ||
      container.querySelector('a[data-e2e="video-avatar"]')?.textContent?.replace(/^@/, '').trim();

    if (!nickname) return null;

    for (const info of awemeAuthorCache.values()) {
      if (info.nickname === nickname) {
        return { ...info, source: 'nickname-aweme-cache' };
      }
    }

    for (const info of liveAuthorCache.values()) {
      if (info.nickname === nickname) {
        return { ...info, source: 'nickname-live-cache' };
      }
    }

    return null;
  }

  async function fetchUserInfoFromLiveRoom(roomId) {
    if (!roomId) return null;

    const cacheKey = String(roomId);
    if (liveAuthorCache.has(cacheKey)) {
      return { ...liveAuthorCache.get(cacheKey), source: 'live-room-cache' };
    }
    if (roomFetchCache.has(cacheKey)) {
      return roomFetchCache.get(cacheKey);
    }

    const task = (async () => {
      const params = new URLSearchParams({
        aid: '6383',
        app_name: 'douyin_web',
        live_id: '1',
        device_platform: 'web',
        language: 'zh-CN',
        enter_from: 'web_homepage_hot',
        cookie_enabled: 'true',
        screen_width: String(screen.width),
        screen_height: String(screen.height),
        browser_language: navigator.language || 'zh-CN',
        browser_platform: navigator.platform || 'Win32',
        browser_name: 'Edge',
        browser_version: getBrowserVersion(),
        os_name: 'Windows',
        os_version: '10',
        web_rid: cacheKey,
        room_id_str: cacheKey,
        enter_source: '',
        is_need_double_stream: 'false',
        msToken: readCookie('msToken') || generateMsToken()
      });

      try {
        const endpoints = [
          `https://live.douyin.com/webcast/room/web/enter/?${params.toString()}`,
          `https://www.douyin.com/webcast/room/web/enter/?${params.toString()}`
        ];

        for (const url of endpoints) {
          const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
              Accept: 'application/json, text/plain, */*',
              Referer: location.origin + '/',
              Origin: location.origin
            }
          });

          if (!response.ok) continue;

          const data = await response.json();
          const user =
            data?.data?.user ||
            data?.data?.owner ||
            data?.data?.room?.owner ||
            data?.data?.room?.anchor;

          if (!user?.sec_uid) continue;

          cacheLiveAuthor(user, cacheKey);
          return {
            secUid: user.sec_uid,
            userId: user.id_str || user.uid || user.id || '',
            nickname: user.nickname || '主播',
            roomId: cacheKey,
            isLive: true,
            source: 'live-room-api'
          };
        }

        return null;
      } catch (_) {
        return null;
      } finally {
        roomFetchCache.delete(cacheKey);
      }
    })();

    roomFetchCache.set(cacheKey, task);
    return task;
  }

  const fallbackNicknameFetchAttempted = new Set();
  const profileNicknameFetchCache = new Map();

  function cacheNicknameForSecUid(secUid, userId, nickname) {
    if (!secUid || isGenericNickname(nickname)) return;
    const cached = awemeAuthorCache.get(secUid) || liveAuthorCache.get(secUid) || {};
    awemeAuthorCache.set(secUid, {
      ...cached,
      secUid,
      userId: userId || cached.userId || '',
      nickname
    });
  }

  async function fetchUserNicknameBySecUid(secUid, userId) {
    if (!secUid || !SEC_UID_RE.test(secUid)) return '';

    const cached = awemeAuthorCache.get(secUid) || liveAuthorCache.get(secUid);
    if (cached?.nickname && !isGenericNickname(cached.nickname)) {
      return cached.nickname;
    }

    if (profileNicknameFetchCache.has(secUid)) {
      return profileNicknameFetchCache.get(secUid);
    }

    if (fallbackNicknameFetchAttempted.has(secUid)) {
      return '';
    }

    const task = (async () => {
      fallbackNicknameFetchAttempted.add(secUid);

      const liveParams = new URLSearchParams({
        aid: '6383',
        app_name: 'douyin_web',
        live_id: '1',
        device_platform: 'web',
        language: 'zh-CN',
        enter_from: 'web_homepage_hot',
        sec_anchor_id: secUid,
        msToken: readCookie('msToken') || generateMsToken()
      });
      if (userId) liveParams.set('anchor_id', String(userId));

      const webParams = new URLSearchParams(getDeviceParams());
      webParams.set('sec_user_id', secUid);
      if (userId) webParams.set('user_id', String(userId));
      webParams.set('msToken', readCookie('msToken') || generateMsToken());
      const webid = readCookie('s_v_web_id');
      if (webid) {
        webParams.set('webid', webid);
        webParams.set('verifyFp', webid);
        webParams.set('fp', webid);
      }

      const urls = [
        `https://www.douyin.com/aweme/v1/web/user/profile/other/?${webParams.toString()}`,
        `https://live.douyin.com/webcast/user/profile/?${liveParams.toString()}`,
        `https://www.douyin.com/webcast/user/profile/?${liveParams.toString()}`
      ];

      for (const url of urls) {
        try {
          const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
              Accept: 'application/json, text/plain, */*',
              Referer: location.href,
              Origin: location.origin
            }
          });
          if (!response.ok) continue;

          const data = await response.json();
          const user = data?.user || data?.data?.user || data?.data?.user_profile?.base_info;
          const nickname = user?.nickname || user?.nick_name || user?.name;
          if (!nickname || isGenericNickname(nickname)) continue;

          cacheLiveAuthor(user, user?.room_id || user?.roomId);
          cacheNicknameForSecUid(secUid, userId || user?.uid || user?.id, nickname);
          return String(nickname).trim();
        } catch (_) {}
      }

      return '';
    })();

    profileNicknameFetchCache.set(secUid, task);
    try {
      return await task;
    } finally {
      profileNicknameFetchCache.delete(secUid);
    }
  }

  async function finalizeAuthorNickname(author) {
    if (!author?.secUid) return author;
    if (!isGenericNickname(author.nickname)) return author;

    const nickname = await fetchUserNicknameBySecUid(author.secUid, author.userId);
    if (nickname) {
      author.nickname = nickname;
    }
    return author;
  }

  function isLiveStreamPage() {
    return location.hostname === 'live.douyin.com' || /^\/live(\/|$)/.test(location.pathname);
  }

  function containerHasLiveBadge(container) {
    if (!container) return false;
    if (container.querySelector('a[href*="live.douyin.com"], a[href*="room_id"]')) return true;
    if (
      container.querySelector(
        'img[alt="LiveIcon"], img[src*="avatar-live"], img[src*="live"], [class*="live"]'
      )
    ) {
      return true;
    }
    return !!extractRoomIdFromContainer(container);
  }

  function getAuthorFromContainerCache(container) {
    if (!container) return null;

    const awemeId =
      container.getAttribute('data-aweme-id') ||
      container.querySelector('[data-aweme-id]')?.getAttribute('data-aweme-id');

    if (awemeId && awemeAuthorCache.has(String(awemeId))) {
      return { ...awemeAuthorCache.get(String(awemeId)), source: 'aweme-cache' };
    }

    const roomId = extractRoomIdFromContainer(container);
    if (roomId && liveAuthorCache.has(String(roomId))) {
      return { ...liveAuthorCache.get(String(roomId)), source: 'room-cache' };
    }

    return null;
  }

  function getAuthorFromVideoAvatar(container) {
    if (!container) return null;

    const avatarLink = container.querySelector('a[data-e2e="video-avatar"]');
    if (!avatarLink) return null;

    const href = normalizeHref(avatarLink.getAttribute('href') || '');
    const userMatch = href.match(/\/user\/([^?/#]+)/);
    if (userMatch && SEC_UID_RE.test(userMatch[1])) {
      const secUid = userMatch[1];
      const cached = awemeAuthorCache.get(secUid) || liveAuthorCache.get(secUid);
      return {
        secUid,
        userId: cached?.userId || '',
        nickname: pickNickname(
          secUid,
          avatarLink.getAttribute('title'),
          avatarLink.textContent?.replace(/^@/, '').trim(),
          cached?.nickname
        ),
        isLive: containerHasLiveBadge(container),
        source: 'video-avatar'
      };
    }

    const roomId = extractRoomIdFromHref(href);
    if (roomId && liveAuthorCache.has(String(roomId))) {
      return { ...liveAuthorCache.get(String(roomId)), source: 'video-avatar-room-cache' };
    }

    return null;
  }

  function getAuthorFromReactInContainer(container) {
    if (!container) return null;

    const anchors = [
      container.querySelector('a[data-e2e="video-avatar"]'),
      container.querySelector('[data-e2e="video-player-digg"]'),
      container.querySelector('video'),
      container
    ];

    for (const el of anchors) {
      const author = extractAuthorFromReactFiber(el);
      if (author) return author;
    }

    return null;
  }

  async function resolveAuthorFromContainer(container, source) {
    if (!container) return null;

    const fromReact = getAuthorFromReactInContainer(container);
    if (fromReact) return enrichAuthor(fromReact, container);

    const cached = getAuthorFromContainerCache(container);
    if (cached) return enrichAuthor(cached, container);

    const fromNickname = guessAuthorFromNickname(container);
    if (fromNickname) return enrichAuthor(fromNickname, container);

    const fromAvatar = getAuthorFromVideoAvatar(container);
    if (fromAvatar) return enrichAuthor(fromAvatar, container);

    const fromDom = extractAuthorFromContainer(container, source);
    if (fromDom) return enrichAuthor(fromDom, container);

    const roomId = extractRoomIdFromContainer(container);
    if (roomId) {
      const fromRoom = await fetchUserInfoFromLiveRoom(roomId);
      return enrichAuthor(fromRoom, container);
    }

    return null;
  }

  function extractAuthorFromContainer(container, source) {
    if (!container) return null;

    const userLinks = container.querySelectorAll('a[href*="/user/"]');
    for (const link of userLinks) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/\/user\/([^?/#]+)/) || href.match(SEC_UID_RE);
      if (!match) continue;

      const secUid = match[1]?.includes('MS4wLj') ? match[1] : match[0];
      if (!SEC_UID_RE.test(secUid)) continue;

      const nickname =
        link.getAttribute('title') ||
        link.textContent?.replace(/^@/, '').trim() ||
        container.querySelector('[data-e2e="video-author-name"], [data-e2e="live-avatar"]')?.textContent?.trim() ||
        '';

      const cached = awemeAuthorCache.get(secUid) || liveAuthorCache.get(secUid);
      return enrichAuthor(
        {
          secUid,
          userId: cached?.userId || '',
          nickname: pickNickname(
            secUid,
            nickname,
            link.getAttribute('title'),
            link.textContent?.replace(/^@/, '').trim(),
            cached?.nickname
          ),
          isLive: containerHasLiveBadge(container),
          source
        },
        container
      );
    }

    const dataSecUid =
      container.getAttribute('data-sec-uid') ||
      container.getAttribute('data-anchor-sec-uid') ||
      container.querySelector('[data-sec-uid], [data-anchor-sec-uid], [data-user-sec-uid]')?.getAttribute(
        'data-sec-uid'
      ) ||
      container.querySelector('[data-anchor-sec-uid]')?.getAttribute('data-anchor-sec-uid');

    if (dataSecUid && SEC_UID_RE.test(dataSecUid)) {
      const cached = awemeAuthorCache.get(dataSecUid) || liveAuthorCache.get(dataSecUid);
      return {
        secUid: dataSecUid,
        userId: cached?.userId || '',
        nickname: pickNickname(
          dataSecUid,
          cached?.nickname,
          container.querySelector('[data-e2e="video-author-name"], [data-e2e="live-avatar"]')?.textContent?.trim()
        ),
        isLive: true,
        source: source + '-data'
      };
    }

    const secUidEls = container.querySelectorAll('[data-sec-uid], [data-author-sec-uid]');
    for (const el of secUidEls) {
      const secUid = el.getAttribute('data-sec-uid') || el.getAttribute('data-author-sec-uid');
      if (secUid && SEC_UID_RE.test(secUid)) {
        const cached = awemeAuthorCache.get(secUid) || liveAuthorCache.get(secUid);
        return {
          secUid,
          userId: cached?.userId || '',
          nickname: pickNickname(secUid, cached?.nickname),
          isLive: containerHasLiveBadge(container),
          source: source + '-attr'
        };
      }
    }

    const roomId = extractRoomIdFromContainer(container);
    if (roomId && liveAuthorCache.has(String(roomId))) {
      return { ...liveAuthorCache.get(String(roomId)), source: source + '-room-cache' };
    }

    return null;
  }

  function findClosestToViewportCenter(elements) {
    const centerY = window.innerHeight / 2;
    let best = null;
    let bestDist = Infinity;

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.height < 60 || rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const dist = Math.abs(rect.top + rect.height / 2 - centerY);
      if (dist < bestDist) {
        bestDist = dist;
        best = el;
      }
    }

    return best;
  }

  function findActiveLiveContainer() {
    const liveCards = document.querySelectorAll('[data-e2e="feed-live"]');
    const visibleCard = findClosestToViewportCenter(liveCards);
    if (visibleCard) return visibleCard;

    const liveRoomEls = document.querySelectorAll('[data-live-room-id], [data-room-id]');
    const visibleRoom = findClosestToViewportCenter(liveRoomEls);
    if (visibleRoom) return visibleRoom;

    const playerControls = document.querySelector('.douyin-player-controls');
    if (playerControls) {
      const rect = playerControls.getBoundingClientRect();
      if (rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0) {
        let parent = playerControls.parentElement;
        for (let depth = 0; parent && depth < 10; depth++) {
          if (
            parent.querySelector('[data-e2e="feed-live"], a[href*="/user/"], [data-live-room-id]')
          ) {
            return parent;
          }
          parent = parent.parentElement;
        }
        return playerControls.parentElement;
      }
    }

    return null;
  }

  function findActiveVideoContainer() {
    const diggButtons = document.querySelectorAll('[data-e2e="video-player-digg"]');
    const visibleDigg = findClosestToViewportCenter(diggButtons);
    if (visibleDigg) {
      let parent = visibleDigg.parentElement;
      for (let depth = 0; parent && depth < 14; depth++) {
        if (
          parent.querySelector(
            'video, a[data-e2e="video-avatar"], a[href*="/user/"], a[href*="live.douyin.com"]'
          )
        ) {
          return parent;
        }
        parent = parent.parentElement;
      }
    }

    const videos = document.querySelectorAll('video');
    const visibleVideo = findClosestToViewportCenter(videos);
    if (visibleVideo) {
      let parent = visibleVideo.parentElement;
      for (let depth = 0; parent && depth < 14; depth++) {
        if (
          parent.querySelector(
            '[data-e2e="video-player-digg"], a[data-e2e="video-avatar"], a[href*="/user/"], a[href*="live.douyin.com"]'
          )
        ) {
          return parent;
        }
        parent = parent.parentElement;
      }
    }

    const avatars = document.querySelectorAll('a[data-e2e="video-avatar"]');
    const visibleAvatar = findClosestToViewportCenter(avatars);
    if (visibleAvatar) {
      let parent = visibleAvatar.parentElement;
      for (let depth = 0; parent && depth < 14; depth++) {
        if (parent.querySelector('video, [data-e2e="video-player-digg"]')) {
          return parent;
        }
        parent = parent.parentElement;
      }
    }

    return null;
  }

  async function getAuthorFromDom() {
    const videoContainer = findActiveVideoContainer();
    if (videoContainer) {
      const videoAuthor = await resolveAuthorFromContainer(videoContainer, 'video-dom');
      if (videoAuthor) return videoAuthor;
    }

    const liveContainer = findActiveLiveContainer();
    if (liveContainer) {
      const liveAuthor = await resolveAuthorFromContainer(liveContainer, 'live-dom');
      if (liveAuthor) return liveAuthor;
    }

    return null;
  }

  function getAuthorFromLiveState() {
    const room = window.__INITIAL_STATE__?.room;
    if (!room) return null;

    const owner = room.owner || room.anchor;
    if (!owner) return null;

    const secUid = owner.sec_uid || owner.secUid;
    if (!secUid) return null;

    cacheLiveAuthor(owner, room.id || room.room_id);
    return {
      secUid,
      userId: owner.uid || owner.user_id || '',
      nickname: owner.nickname || owner.short_id || '主播',
      isLive: true,
      source: 'initial-state'
    };
  }

  async function getAuthorFromLivePage() {
    if (!isLiveStreamPage()) return null;

    const fromState = getAuthorFromLiveState();
    if (fromState) return fromState;

    const pageUrl = location.href;
    let secAnchorId = null;
    const anchorIdMatch = pageUrl.match(/anchor_id=(\d+)/);
    const anchorId = anchorIdMatch ? anchorIdMatch[1] : null;

    const urlSecMatch = pageUrl.match(/sec_anchor_id=([^&\s]+)/);
    if (urlSecMatch) secAnchorId = decodeURIComponent(urlSecMatch[1]);

    if (!secAnchorId) {
      for (const iframe of document.querySelectorAll('iframe')) {
        const match = (iframe.src || '').match(/sec_anchor_id=([^&\s]+)/);
        if (match) {
          secAnchorId = decodeURIComponent(match[1]);
          break;
        }
      }
    }

    if (!secAnchorId) {
      for (const script of document.querySelectorAll('script')) {
        const content = script.textContent || '';
        const match =
          content.match(/sec_anchor_id["\s:]+["']?([^"'&\s\\]+)/) ||
          content.match(/secUid["\s:]+["']?([^"'&\s]+)/);
        if (match && SEC_UID_RE.test(match[1])) {
          secAnchorId = match[1];
          break;
        }
      }
    }

    if (secAnchorId && SEC_UID_RE.test(secAnchorId)) {
      return {
        secUid: secAnchorId,
        userId: anchorId || '',
        nickname: '主播',
        isLive: true,
        source: 'live-url'
      };
    }

    if (anchorId) {
      try {
        const profileUrl =
          `https://live.douyin.com/webcast/user/profile/?aid=6383&app_name=douyin_web&live_id=1&device_platform=web&language=zh-CN&enter_from=web_live&anchor_id=${anchorId}` +
          (secAnchorId ? `&sec_anchor_id=${encodeURIComponent(secAnchorId)}` : '') +
          `&msToken=${encodeURIComponent(readCookie('msToken') || generateMsToken())}`;

        const response = await fetch(profileUrl, {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json, text/plain, */*',
            Referer: pageUrl
          }
        });

        if (response.ok) {
          const data = await response.json();
          const baseInfo = data?.data?.user_profile?.base_info;
          if (baseInfo?.sec_uid) {
            cacheLiveAuthor(baseInfo);
            return {
              secUid: baseInfo.sec_uid,
              userId: baseInfo.uid || baseInfo.id || anchorId,
              nickname: baseInfo.nickname || '主播',
              isLive: true,
              source: 'live-api'
            };
          }
        }
      } catch (_) {}
    }

    const sidePanelAuthor = extractAuthorFromContainer(document.body, 'live-page');
    if (sidePanelAuthor) return sidePanelAuthor;

    return null;
  }

  function getAuthorFromLiveFeed() {
    const fromState = getAuthorFromLiveState();
    if (fromState) return fromState;

    const playerEl =
      document.querySelector('[data-room-id]') ||
      document.querySelector('[data-anchor-sec-uid]') ||
      document.querySelector('[data-live-room-id]');

    if (playerEl) {
      const secUid =
        playerEl.getAttribute('data-anchor-sec-uid') ||
        playerEl.getAttribute('data-sec-uid');
      const roomId =
        playerEl.getAttribute('data-room-id') || playerEl.getAttribute('data-live-room-id');

      if (secUid && SEC_UID_RE.test(secUid)) {
        return {
          secUid,
          userId: playerEl.getAttribute('data-anchor-uid') || playerEl.getAttribute('data-user-id') || '',
          nickname: pickNickname(
            secUid,
            playerEl.getAttribute('data-anchor-name') || playerEl.getAttribute('title')
          ),
          isLive: true,
          source: 'live-player-data'
        };
      }

      if (roomId && liveAuthorCache.has(String(roomId))) {
        return { ...liveAuthorCache.get(String(roomId)), source: 'live-player-cache' };
      }
    }

    return null;
  }

  function getAuthorFromUserPage() {
    const match = location.pathname.match(/\/user\/([^/?#]+)/);
    if (!match || !SEC_UID_RE.test(match[1])) return null;

    const secUid = match[1];
    const cached = awemeAuthorCache.get(secUid) || liveAuthorCache.get(secUid);
    const nickname = pickNickname(
      secUid,
      document.querySelector('[data-e2e="user-title"], h1')?.textContent?.trim(),
      cached?.nickname
    );

    return {
      secUid,
      userId: cached?.userId || '',
      nickname,
      isLive: containerHasLiveBadge(document.body),
      source: 'user-page'
    };
  }

  async function getAuthorFromVideoPage() {
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
        const detail = findAwemeDetailInRender(json);
        if (detail) {
          cacheAwemeAuthor(detail);
          const found = awemeAuthorCache.get(awemeId);
          if (found) return { ...found, source: 'render-data' };
        }
      } catch (_) {}
    }

    const detailContainer =
      document.querySelector('[data-e2e="video-detail"]') ||
      document.querySelector('[data-e2e="browse-video"]') ||
      document.body;

    const fromDetail = await resolveAuthorFromContainer(detailContainer, 'video-page');
    if (fromDetail) return fromDetail;

    return null;
  }

  async function getCurrentAuthor() {
    let author = await getAuthorFromDom();
    if (!author) author = getAuthorFromLiveFeed();
    if (!author) author = await getAuthorFromLivePage();
    if (!author) author = await getAuthorFromVideoPage();
    if (!author) author = getAuthorFromUserPage();

    if (!author) {
      const visibleContainer = findActiveVideoContainer() || findActiveLiveContainer();
      const roomId = extractRoomIdFromContainer(visibleContainer);
      if (roomId) {
        author = await fetchUserInfoFromLiveRoom(roomId);
      }
    }

    if (!author) return null;
    return await finalizeAuthorNickname(author);
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'douyin-block-extension') {
      return;
    }

    const { action, requestId, payload } = event.data;

    try {
      if (action === 'get-author') {
        const author = await getCurrentAuthor();
        window.postMessage(
          { source: 'douyin-block-extension', action: 'get-author-result', requestId, author },
          '*'
        );
        return;
      }

      if (action === 'fetch-user-nickname') {
        const { secUid, userId } = payload || {};
        const nickname = await fetchUserNicknameBySecUid(secUid, userId);
        window.postMessage(
          {
            source: 'douyin-block-extension',
            action: 'fetch-user-nickname-result',
            requestId,
            result: { nickname }
          },
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
          action: action === 'get-author' ? 'get-author-result' : action === 'fetch-user-nickname' ? 'fetch-user-nickname-result' : 'block-user-result',
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
