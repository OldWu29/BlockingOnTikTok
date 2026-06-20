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
    const info = UserInfoUtil.from(user);
    if (!info.isValid()) return false;

    const map = await this.getMap();
    map[info.secUid] = info.toStorageRecord();
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
