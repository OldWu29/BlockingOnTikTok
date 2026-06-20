/**
 * 抖音作者 / 黑名单用户统一信息模型与获取工具
 */
(function (root) {
  const SEC_UID_RE = /MS4wLj[A-Za-z0-9_\-]{15,}/;
  const GENERIC_NICKNAMES = new Set(['未知作者', '未知用户', '主播', '该用户']);

  class UserInfo {
    constructor(data = {}) {
      this.secUid = String(data.secUid || data.sec_uid || '').trim();
      this.userId = String(data.userId || data.user_id || data.uid || data.id || '').trim();
      this.nickname = String(data.nickname || data.nick_name || data.name || '').trim();
      this.blocked = !!data.blocked;
      this.isLive = !!data.isLive;
      this.awemeId = String(data.awemeId || data.aweme_id || '').trim();
      this.roomId = String(data.roomId || data.room_id || '').trim();
      this.source = String(data.source || '').trim();
      this.blockedAt = data.blockedAt || 0;
    }

    isValid() {
      return this.secUid && SEC_UID_RE.test(this.secUid);
    }

    isGenericNickname() {
      return UserInfoUtil.isGenericNickname(this.nickname);
    }

    getDisplayName(fallback = '该用户') {
      return UserInfoUtil.pickDisplayName(this.nickname, fallback);
    }

    toPlainObject() {
      return {
        secUid: this.secUid,
        userId: this.userId,
        nickname: this.nickname,
        blocked: this.blocked,
        isLive: this.isLive,
        awemeId: this.awemeId,
        roomId: this.roomId,
        source: this.source,
        blockedAt: this.blockedAt
      };
    }

    toStorageRecord() {
      const nickname = this.getDisplayName('未知用户');
      return {
        secUid: this.secUid,
        userId: this.userId,
        nickname: UserInfoUtil.isGenericNickname(nickname) ? '未知用户' : nickname,
        blockedAt: this.blockedAt || Date.now()
      };
    }

    clone(patch = {}) {
      return UserInfoUtil.from({ ...this.toPlainObject(), ...patch });
    }
  }

  class UserInfoUtil {
    static _current = null;
    static _pageBridge = null;
    static _nicknameFallbackFetched = new Set();

    static isGenericNickname(name) {
      const value = String(name || '').trim();
      return !value || GENERIC_NICKNAMES.has(value);
    }

    static pickDisplayName(...candidates) {
      for (const name of candidates) {
        if (!UserInfoUtil.isGenericNickname(name)) return String(name).trim();
      }
      for (const name of candidates) {
        if (name && String(name).trim()) return String(name).trim();
      }
      return '该用户';
    }

    static from(data) {
      if (!data) return new UserInfo();
      if (data instanceof UserInfo) return data.clone();
      return new UserInfo(data);
    }

    static registerPageBridge(bridge) {
      UserInfoUtil._pageBridge = bridge || null;
    }

    static getCurrent() {
      return UserInfoUtil._current;
    }

    static setCurrent(userInfo) {
      if (!userInfo) {
        UserInfoUtil._current = null;
        return null;
      }
      const info = UserInfoUtil.from(userInfo);
      UserInfoUtil._current = info.isValid() ? info : null;
      return UserInfoUtil._current;
    }

    static async fetchNicknameFromPage(secUid, userId) {
      const bridge = UserInfoUtil._pageBridge;
      if (!secUid || !bridge?.callPage) return '';

      if (UserInfoUtil._nicknameFallbackFetched.has(secUid)) return '';
      UserInfoUtil._nicknameFallbackFetched.add(secUid);

      try {
        if (bridge.ensureInjectReady) await bridge.ensureInjectReady();
        const result = await bridge.callPage('fetch-user-nickname', { secUid, userId });
        const nickname = result?.nickname;
        if (nickname && !UserInfoUtil.isGenericNickname(nickname)) {
          return String(nickname).trim();
        }
      } catch (_) {}

      return '';
    }

    static async resolveDisplayName(userInfo, ...extraCandidates) {
      const info = UserInfoUtil.from(userInfo);
      const candidates = [info.nickname, ...extraCandidates];

      for (const name of candidates) {
        if (!UserInfoUtil.isGenericNickname(name)) return String(name).trim();
      }

      if (info.secUid && typeof BlacklistStorage !== 'undefined') {
        const existing = await BlacklistStorage.get(info.secUid);
        if (existing?.nickname && !UserInfoUtil.isGenericNickname(existing.nickname)) {
          return existing.nickname;
        }
      }

      for (const name of candidates) {
        if (name && String(name).trim()) return String(name).trim();
      }

      const fetched = await UserInfoUtil.fetchNicknameFromPage(info.secUid, info.userId);
      if (fetched) return fetched;

      return info.getDisplayName();
    }

    static async enrichBlockedState(userInfo) {
      const info = UserInfoUtil.from(userInfo);
      if (!info.isValid()) return info;

      if (typeof BlacklistStorage !== 'undefined') {
        info.blocked = await BlacklistStorage.isBlocked(info.secUid);
      }
      return info;
    }

    static clearFetchState(secUid) {
      if (secUid) {
        UserInfoUtil._nicknameFallbackFetched.delete(secUid);
      } else {
        UserInfoUtil._nicknameFallbackFetched.clear();
      }
    }

    static async fetchCurrentAuthor(options = {}) {
      const force = !!options.force;
      const previous = UserInfoUtil._current;
      const bridge = UserInfoUtil._pageBridge;
      if (!bridge?.callPage) return previous?.isValid() ? previous : null;

      if (force) UserInfoUtil.clearFetchState();

      if (bridge.ensureInjectReady) await bridge.ensureInjectReady();
      const raw = await bridge.callPage('get-author', force ? { force: true } : {});
      let info = UserInfoUtil.from(raw);

      if (!info.isValid() && force && previous?.isValid()) {
        info = previous.clone();
      }

      if (!info.isValid()) return null;

      const enriched = await UserInfoUtil.enrichBlockedState(info);
      UserInfoUtil.setCurrent(enriched);
      return enriched;
    }

    static async blockOrUnblockCurrent(unblock) {
      const author = await UserInfoUtil.fetchCurrentAuthor({ force: true });
      if (!author?.isValid()) {
        return { author: null, shouldUnblock: typeof unblock === 'boolean' ? unblock : false };
      }

      const shouldUnblock = typeof unblock === 'boolean' ? unblock : author.blocked;
      return { author, shouldUnblock };
    }

    static async getBySecUid(secUid) {
      if (!secUid || typeof BlacklistStorage === 'undefined') return null;
      const raw = await BlacklistStorage.get(secUid);
      return raw ? UserInfoUtil.from(raw) : null;
    }

    static async getBlacklist() {
      if (typeof BlacklistStorage === 'undefined') return [];
      const list = await BlacklistStorage.getList();
      return list.map((item) => UserInfoUtil.from(item));
    }
  }

  root.UserInfo = UserInfo;
  root.UserInfoUtil = UserInfoUtil;
})(typeof globalThis !== 'undefined' ? globalThis : window);
