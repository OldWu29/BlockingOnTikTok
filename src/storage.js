const BlacklistStorage = {
  KEY: 'douyin_blacklist',

  async getMap() {
    const data = await chrome.storage.local.get(this.KEY);
    return data[this.KEY] || {};
  },

  async getList() {
    const map = await this.getMap();
    return Object.values(map).sort((a, b) => (b.blockedAt || 0) - (a.blockedAt || 0));
  },

  async getCount() {
    const map = await this.getMap();
    return Object.keys(map).length;
  },

  async isBlocked(secUid) {
    if (!secUid) return false;
    const map = await this.getMap();
    return !!map[secUid];
  },

  async get(secUid) {
    if (!secUid) return null;
    const map = await this.getMap();
    return map[secUid] || null;
  },

  async add(user) {
    if (!user?.secUid) return false;

    const map = await this.getMap();
    map[user.secUid] = {
      secUid: user.secUid,
      userId: user.userId || '',
      nickname: user.nickname && !['未知作者', '未知用户', '主播'].includes(user.nickname)
        ? user.nickname
        : '未知用户',
      blockedAt: user.blockedAt || Date.now()
    };

    await chrome.storage.local.set({ [this.KEY]: map });
    return true;
  },

  async remove(secUid) {
    if (!secUid) return false;

    const map = await this.getMap();
    if (!map[secUid]) return false;

    delete map[secUid];
    await chrome.storage.local.set({ [this.KEY]: map });
    return true;
  },

  async clear() {
    await chrome.storage.local.set({ [this.KEY]: {} });
  }
};
