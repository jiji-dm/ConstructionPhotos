// IndexedDB データ層
// ストア: sites / groups / categories / photos / states / devices

const DB_NAME = 'construction-photos';
const DB_VERSION = 1;

const DEFAULT_STATES = ['設置前', '設置後', '撤去前', '撤去後', '交換前', '交換後', '移設前', '移設後'];
const DEFAULT_DEVICES = ['IPカメラ', 'ステカメ', 'BOX', 'コンセント', 'ウェブカメラ', 'サイネージ', 'LiDAR'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;

      if (!db.objectStoreNames.contains('sites')) {
        db.createObjectStore('sites', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('groups')) {
        const s = db.createObjectStore('groups', { keyPath: 'id' });
        s.createIndex('siteId', 'siteId', { unique: false });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('groupId', 'groupId', { unique: false });
      }
      if (!db.objectStoreNames.contains('states')) {
        const s = db.createObjectStore('states', { keyPath: 'id' });
        DEFAULT_STATES.forEach((name, i) => s.add({ id: uid(), name, order: i }));
      }
      if (!db.objectStoreNames.contains('devices')) {
        const s = db.createObjectStore('devices', { keyPath: 'id' });
        DEFAULT_DEVICES.forEach((name, i) => s.add({ id: uid(), name, order: i }));
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function tx(storeNames, mode) {
  return openDB().then((db) => db.transaction(storeNames, mode));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(store) {
  return tx(store, 'readonly').then((t) => reqToPromise(t.objectStore(store).getAll()));
}
function getAllByIndex(store, index, value) {
  return tx(store, 'readonly').then((t) =>
    reqToPromise(t.objectStore(store).index(index).getAll(value))
  );
}
function getOne(store, id) {
  return tx(store, 'readonly').then((t) => reqToPromise(t.objectStore(store).get(id)));
}
function put(store, value) {
  return tx(store, 'readwrite').then((t) => {
    const r = reqToPromise(t.objectStore(store).put(value));
    return r.then(() => value);
  });
}
function del(store, id) {
  return tx(store, 'readwrite').then((t) => reqToPromise(t.objectStore(store).delete(id)));
}

// ---- 現場 (sites) ----
export const Sites = {
  list: () => getAll('sites').then((a) => a.sort((x, y) => y.createdAt - x.createdAt)),
  get: (id) => getOne('sites', id),
  create: (name) => put('sites', { id: uid(), name: name.trim(), createdAt: Date.now() }),
  rename: async (id, name) => {
    const s = await getOne('sites', id);
    if (!s) return;
    s.name = name.trim();
    return put('sites', s);
  },
  remove: async (id) => {
    const groups = await Groups.listBySite(id);
    for (const g of groups) await Groups.remove(g.id);
    return del('sites', id);
  },
};

// ---- 場所 (groups) ----
export const Groups = {
  listBySite: (siteId) =>
    getAllByIndex('groups', 'siteId', siteId).then((a) =>
      a.sort((x, y) => x.createdAt - y.createdAt)
    ),
  get: (id) => getOne('groups', id),
  create: (siteId, name) =>
    put('groups', { id: uid(), siteId, name: name.trim(), createdAt: Date.now() }),
  rename: async (id, name) => {
    const g = await getOne('groups', id);
    if (!g) return;
    g.name = name.trim();
    return put('groups', g);
  },
  remove: async (id) => {
    const photos = await Photos.listByGroup(id);
    for (const p of photos) await del('photos', p.id);
    return del('groups', id);
  },
};

// ---- カテゴリ (場所名の再利用候補) ----
export const Categories = {
  list: () => getAll('categories').then((a) => a.sort((x, y) => x.name.localeCompare(y.name, 'ja'))),
  add: async (name) => {
    name = name.trim();
    if (!name) return;
    const all = await getAll('categories');
    if (all.some((c) => c.name === name)) return; // 重複しない
    return put('categories', { id: uid(), name });
  },
  rename: async (id, name) => {
    const c = await getOne('categories', id);
    if (!c) return;
    c.name = name.trim();
    return put('categories', c);
  },
  remove: (id) => del('categories', id),
};

// ---- 写真 (photos) ----
export const Photos = {
  listByGroup: (groupId) =>
    getAllByIndex('photos', 'groupId', groupId).then((a) =>
      a.sort((x, y) => x.createdAt - y.createdAt)
    ),
  // 連番は (groupId, state, device, number) ごとに 1 から
  nextSeq: async (groupId, state, device, number) => {
    const photos = await Photos.listByGroup(groupId);
    const num = number || '';
    const max = photos
      .filter((p) => p.state === state && p.device === device && (p.number || '') === num)
      .reduce((m, p) => Math.max(m, p.seq || 0), 0);
    return max + 1;
  },
  add: (photo) => put('photos', photo),
  remove: (id) => del('photos', id),
};

// ---- 状態リスト (states) ----
export const States = {
  list: () => getAll('states').then((a) => a.sort((x, y) => (x.order || 0) - (y.order || 0))),
  add: async (name) => {
    name = name.trim();
    if (!name) return;
    const all = await getAll('states');
    if (all.some((s) => s.name === name)) return;
    return put('states', { id: uid(), name, order: all.length });
  },
  rename: async (id, name) => {
    const s = await getOne('states', id);
    if (!s) return;
    s.name = name.trim();
    return put('states', s);
  },
  remove: (id) => del('states', id),
};

// ---- 機器リスト (devices) ----
export const Devices = {
  list: () => getAll('devices').then((a) => a.sort((x, y) => (x.order || 0) - (y.order || 0))),
  add: async (name) => {
    name = name.trim();
    if (!name) return;
    const all = await getAll('devices');
    if (all.some((d) => d.name === name)) return;
    return put('devices', { id: uid(), name, order: all.length });
  },
  rename: async (id, name) => {
    const d = await getOne('devices', id);
    if (!d) return;
    d.name = name.trim();
    return put('devices', d);
  },
  remove: (id) => del('devices', id),
};
