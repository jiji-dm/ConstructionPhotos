import { Sites, Groups, Categories, Photos, States, Devices, uid } from './db.js';
import { createZip } from './zip.js';

const APP_VERSION = '1.1';
const app = document.getElementById('app');

/* ========== ユーティリティ ========== */

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ファイル名/フォルダ名に使えない文字を除去
function sanitize(s) {
  return (s || '').replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || '無名';
}

let objectUrls = [];
function makeUrl(blob) {
  const u = URL.createObjectURL(blob);
  objectUrls.push(u);
  return u;
}
function clearUrls() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 1800);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ========== モーダル ========== */

function backdrop(node) {
  const b = document.createElement('div');
  b.className = 'backdrop';
  b.appendChild(node);
  document.body.appendChild(b);
  const close = () => b.remove();
  b.addEventListener('click', (e) => {
    if (e.target === b) close();
  });
  return { close, el: b };
}

function promptDialog({ title, value = '', placeholder = '', okLabel = 'OK' }) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <input class="modal-input" type="text" placeholder="${escapeHtml(placeholder)}" />
      <div class="modal-actions">
        <button class="btn btn-ghost js-cancel">キャンセル</button>
        <button class="btn btn-primary js-ok">${escapeHtml(okLabel)}</button>
      </div>`;
    const m = backdrop(box);
    const input = box.querySelector('.modal-input');
    input.value = value;
    setTimeout(() => input.focus(), 50);
    const done = (v) => {
      m.close();
      resolve(v);
    };
    box.querySelector('.js-cancel').onclick = () => done(null);
    box.querySelector('.js-ok').onclick = () => done(input.value.trim() || null);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value.trim() || null);
    });
  });
}

function confirmDialog({ title, message = '', okLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      ${message ? `<p class="modal-msg">${escapeHtml(message)}</p>` : ''}
      <div class="modal-actions">
        <button class="btn btn-ghost js-cancel">キャンセル</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} js-ok">${escapeHtml(okLabel)}</button>
      </div>`;
    const m = backdrop(box);
    box.querySelector('.js-cancel').onclick = () => {
      m.close();
      resolve(false);
    };
    box.querySelector('.js-ok').onclick = () => {
      m.close();
      resolve(true);
    };
  });
}

// 下から出るアクションメニュー
function actionSheet(actions) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = actions
    .map(
      (a, i) =>
        `<button class="sheet-item ${a.danger ? 'danger' : ''}" data-i="${i}">${escapeHtml(a.label)}</button>`
    )
    .join('');
  const m = backdrop(sheet);
  sheet.querySelectorAll('.sheet-item').forEach((btn) => {
    btn.onclick = () => {
      m.close();
      actions[+btn.dataset.i].onClick();
    };
  });
}

/* ========== ヘッダ ========== */

function header({ title, back, action }) {
  return `
    <header class="topbar">
      ${back ? `<a class="icon-btn" href="#${back}" aria-label="戻る">‹</a>` : '<span class="icon-btn placeholder"></span>'}
      <h1 class="title">${escapeHtml(title)}</h1>
      ${action || '<span class="icon-btn placeholder"></span>'}
    </header>`;
}

/* ========== ルーター ========== */

async function route() {
  clearUrls();
  const hash = location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);
  try {
    if (parts.length === 0) return await renderHome();
    if (parts[0] === 'site') return await renderSite(parts[1]);
    if (parts[0] === 'group') return await renderGroup(parts[1]);
    if (parts[0] === 'settings') return await renderSettings();
    await renderHome();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="error">エラーが発生しました: ${escapeHtml(String(err))}</div>`;
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);

function go(hash) {
  location.hash = hash;
}

/* ========== ① ホーム：現場一覧 ========== */

async function renderHome() {
  const sites = await Sites.list();
  const counts = {};
  for (const s of sites) {
    const groups = await Groups.listBySite(s.id);
    counts[s.id] = groups.length;
  }

  app.innerHTML = `
    ${header({
      title: '工事写真',
      action: `<a class="icon-btn" href="#/settings" aria-label="設定">⚙</a>`,
    })}
    <main class="content home-content">
      ${
        sites.length === 0
          ? `<div class="empty">まだ現場がありません。<br>右下の＋から現場を追加してください。</div>`
          : `<ul class="list">${sites
              .map(
                (s) => `
            <li class="list-row" data-go="#/site/${s.id}">
              <label class="row-check-wrap" data-noclick>
                <input type="checkbox" class="row-check" data-id="${s.id}" />
              </label>
              <span class="row-icon">🏗</span>
              <span class="row-main">
                <span class="row-title">${escapeHtml(s.name)}</span>
                <span class="row-sub">${counts[s.id]} 場所</span>
              </span>
              <button class="icon-btn js-more" data-id="${s.id}" data-name="${escapeHtml(s.name)}">⋯</button>
              <span class="row-chevron">›</span>
            </li>`
              )
              .join('')}</ul>`
      }
    </main>
    <div class="bulk-bar" hidden>
      <span class="bulk-count js-bulk-count">選択中 0件</span>
      <div class="bulk-actions">
        <button class="btn btn-ghost btn-sm js-bulk-export">⬇ ZIP書き出し</button>
        <button class="btn btn-danger btn-sm js-bulk-delete">🗑 削除</button>
      </div>
    </div>
    <button class="fab js-add">＋ 新しい現場</button>
  `;

  bindRowNav();

  const bulkBar = app.querySelector('.bulk-bar');
  const bulkCount = app.querySelector('.js-bulk-count');
  const fab = app.querySelector('.fab');
  const checks = app.querySelectorAll('.row-check');

  const getSelectedIds = () =>
    [...checks].filter((c) => c.checked).map((c) => c.dataset.id);

  const updateBulkBar = () => {
    const ids = getSelectedIds();
    if (ids.length > 0) {
      bulkCount.textContent = `選択中 ${ids.length}件`;
      bulkBar.hidden = false;
      fab.hidden = true;
    } else {
      bulkBar.hidden = true;
      fab.hidden = false;
    }
  };

  checks.forEach((c) => {
    c.addEventListener('click', (e) => e.stopPropagation());
    c.addEventListener('change', updateBulkBar);
  });
  // checkbox周りのlabelがタップで親rowへ伝播しないように
  app.querySelectorAll('[data-noclick]').forEach((el) => {
    el.addEventListener('click', (e) => e.stopPropagation());
  });

  app.querySelector('.js-bulk-export').onclick = async () => {
    const ids = getSelectedIds();
    if (!ids.length) return;
    await exportSites(ids);
  };
  app.querySelector('.js-bulk-delete').onclick = async () => {
    const ids = getSelectedIds();
    if (!ids.length) return;
    const ok = await confirmDialog({
      title: `${ids.length}件の現場を削除`,
      message: '中の場所と写真もすべて削除されます。',
      okLabel: '削除',
      danger: true,
    });
    if (!ok) return;
    for (const id of ids) await Sites.remove(id);
    route();
  };

  app.querySelector('.js-add').onclick = async () => {
    const name = await promptDialog({ title: '新しい現場', placeholder: '例：〇〇ホテル', okLabel: '作成' });
    if (name) {
      await Sites.create(name);
      route();
    }
  };

  app.querySelectorAll('.js-more').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      actionSheet([
        {
          label: '名前を変更',
          onClick: async () => {
            const name = await promptDialog({ title: '現場名を変更', value: btn.dataset.name, okLabel: '保存' });
            if (name) {
              await Sites.rename(id, name);
              route();
            }
          },
        },
        {
          label: 'この現場を削除',
          danger: true,
          onClick: async () => {
            const ok = await confirmDialog({
              title: '現場を削除',
              message: '中の場所と写真もすべて削除されます。',
              okLabel: '削除',
              danger: true,
            });
            if (ok) {
              await Sites.remove(id);
              route();
            }
          },
        },
      ]);
    };
  });
}

/* ========== ② 現場：場所(グループ)一覧 ========== */

async function renderSite(siteId) {
  const site = await Sites.get(siteId);
  if (!site) return go('/');
  const groups = await Groups.listBySite(siteId);
  const counts = {};
  for (const g of groups) {
    const photos = await Photos.listByGroup(g.id);
    counts[g.id] = photos.length;
  }

  app.innerHTML = `
    ${header({
      title: site.name,
      back: '/',
      action: `<button class="icon-btn js-site-more" aria-label="メニュー">⋯</button>`,
    })}
    <main class="content">
      ${
        groups.length === 0
          ? `<div class="empty">まだ場所がありません。<br>下の「＋ 場所を追加」から作成してください。</div>`
          : `<ul class="list">${groups
              .map(
                (g) => `
            <li class="list-row" data-go="#/group/${g.id}">
              <span class="row-icon">📍</span>
              <span class="row-main">
                <span class="row-title">${escapeHtml(g.name)}</span>
                <span class="row-sub">${counts[g.id]} 枚</span>
              </span>
              <button class="icon-btn js-more" data-id="${g.id}" data-name="${escapeHtml(g.name)}">⋯</button>
              <span class="row-chevron">›</span>
            </li>`
              )
              .join('')}</ul>`
      }
    </main>
    <div class="bottom-actions">
      <button class="btn btn-primary js-add-group">＋ 場所を追加</button>
    </div>
  `;

  bindRowNav();

  app.querySelector('.js-site-more').onclick = () => {
    actionSheet([
      {
        label: '現場名を変更',
        onClick: async () => {
          const name = await promptDialog({ title: '現場名を変更', value: site.name, okLabel: '保存' });
          if (name) {
            await Sites.rename(siteId, name);
            route();
          }
        },
      },
      {
        label: 'この現場を削除',
        danger: true,
        onClick: async () => {
          const ok = await confirmDialog({
            title: '現場を削除',
            message: '中の場所と写真もすべて削除されます。',
            okLabel: '削除',
            danger: true,
          });
          if (ok) {
            await Sites.remove(siteId);
            go('/');
          }
        },
      },
    ]);
  };

  app.querySelector('.js-add-group').onclick = () => addGroupDialog(siteId);

  app.querySelectorAll('.js-more').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      actionSheet([
        {
          label: '名前を変更',
          onClick: async () => {
            const name = await promptDialog({ title: '場所名を変更', value: btn.dataset.name, okLabel: '保存' });
            if (name) {
              await Groups.rename(id, name);
              route();
            }
          },
        },
        {
          label: 'この場所を削除',
          danger: true,
          onClick: async () => {
            const ok = await confirmDialog({
              title: '場所を削除',
              message: '中の写真もすべて削除されます。',
              okLabel: '削除',
              danger: true,
            });
            if (ok) {
              await Groups.remove(id);
              route();
            }
          },
        },
      ]);
    };
  });
}

// 場所追加：カテゴリ候補から選ぶ or 新規入力
async function addGroupDialog(siteId) {
  const cats = await Categories.list();
  const box = document.createElement('div');
  box.className = 'modal';
  box.innerHTML = `
    <h3>場所を追加</h3>
    ${
      cats.length
        ? `<p class="modal-msg">候補から選ぶ:</p>
           <div class="chips">${cats
             .map((c) => `<button class="chip" data-name="${escapeHtml(c.name)}">${escapeHtml(c.name)}</button>`)
             .join('')}</div>`
        : ''
    }
    <p class="modal-msg">または新しい場所名を入力:</p>
    <input class="modal-input" type="text" placeholder="例：喫煙所" />
    <div class="modal-actions">
      <button class="btn btn-ghost js-cancel">キャンセル</button>
      <button class="btn btn-primary js-ok">追加</button>
    </div>`;
  const m = backdrop(box);
  const input = box.querySelector('.modal-input');
  box.querySelectorAll('.chip').forEach((chip) => {
    chip.onclick = () => {
      input.value = chip.dataset.name;
    };
  });
  box.querySelector('.js-cancel').onclick = () => m.close();
  const submit = async () => {
    const name = input.value.trim();
    if (!name) return;
    m.close();
    await Categories.add(name); // 次回の候補として登録
    await Groups.create(siteId, name);
    route();
  };
  box.querySelector('.js-ok').onclick = submit;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}

/* ========== ③ 場所：撮影＋ギャラリー ========== */

async function renderGroup(groupId) {
  const group = await Groups.get(groupId);
  if (!group) return go('/');
  const photos = await Photos.listByGroup(groupId);

  app.innerHTML = `
    ${header({ title: group.name, back: `/site/${group.siteId}` })}
    <main class="content gallery-content">
      ${
        photos.length === 0
          ? `<div class="empty">まだ写真がありません。<br>下の撮影ボタンから撮影してください。</div>`
          : `<div class="grid">${photos
              .map(
                (p, i) => `
            <figure class="thumb" data-i="${i}">
              <img src="${makeUrl(p.blob)}" loading="lazy" alt="${escapeHtml(p.filename)}" />
              <figcaption>${escapeHtml(p.filename)}</figcaption>
            </figure>`
              )
              .join('')}</div>`
      }
    </main>
    <div class="cam-buttons">
      <button class="shutter-fab js-camera" aria-label="撮影">📷 アプリ内カメラで撮影</button>
    </div>
  `;

  app.querySelectorAll('.thumb').forEach((fig) => {
    fig.onclick = () => openViewer(groupId, +fig.dataset.i);
  });
  app.querySelector('.js-camera').onclick = () => openCamera(group);
}

/* ========== 写真ビューア（スワイプ閲覧） ========== */

async function openViewer(groupId, startIndex) {
  let photos = await Photos.listByGroup(groupId);
  if (!photos.length) return;
  let idx = Math.max(0, Math.min(startIndex, photos.length - 1));

  const viewer = document.createElement('div');
  viewer.className = 'viewer';
  viewer.innerHTML = `
    <div class="viewer-top">
      <button class="icon-btn js-close" aria-label="閉じる">✕</button>
      <span class="viewer-name"></span>
      <button class="icon-btn js-del" aria-label="削除">🗑</button>
    </div>
    <div class="viewer-stage">
      <button class="nav-zone left js-prev" aria-label="前へ">‹</button>
      <img class="viewer-img" alt="" />
      <button class="nav-zone right js-next" aria-label="次へ">›</button>
    </div>
    <div class="viewer-counter"></div>
  `;
  document.body.appendChild(viewer);

  const img = viewer.querySelector('.viewer-img');
  const nameEl = viewer.querySelector('.viewer-name');
  const counter = viewer.querySelector('.viewer-counter');
  let currentUrl = null;

  const show = () => {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    const p = photos[idx];
    currentUrl = URL.createObjectURL(p.blob);
    img.src = currentUrl;
    nameEl.textContent = p.filename;
    counter.textContent = `${idx + 1} / ${photos.length}`;
  };
  const close = () => {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    viewer.remove();
    route(); // ギャラリーを更新
  };
  const prev = () => {
    if (idx > 0) {
      idx--;
      show();
    }
  };
  const next = () => {
    if (idx < photos.length - 1) {
      idx++;
      show();
    }
  };

  viewer.querySelector('.js-close').onclick = close;
  viewer.querySelector('.js-prev').onclick = prev;
  viewer.querySelector('.js-next').onclick = next;
  viewer.querySelector('.js-del').onclick = async () => {
    const ok = await confirmDialog({ title: 'この写真を削除', okLabel: '削除', danger: true });
    if (!ok) return;
    await Photos.remove(photos[idx].id);
    photos = await Photos.listByGroup(groupId);
    if (!photos.length) return close();
    idx = Math.min(idx, photos.length - 1);
    show();
  };

  // スワイプ
  let startX = 0;
  const stage = viewer.querySelector('.viewer-stage');
  stage.addEventListener('touchstart', (e) => (startX = e.touches[0].clientX), { passive: true });
  stage.addEventListener(
    'touchend',
    (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (dx > 50) prev();
      else if (dx < -50) next();
    },
    { passive: true }
  );

  show();
}

/* ========== カメラ（getUserMedia） ========== */

async function openCamera(group) {
  const states = await States.list();
  const devices = await Devices.list();
  if (!states.length || !devices.length) {
    toast('設定で状態と機器を1つ以上登録してください');
    return;
  }

  const lastState = localStorage.getItem('lastState');
  const lastDevice = localStorage.getItem('lastDevice');
  let curState = states.find((s) => s.name === lastState)?.name || states[0].name;
  let curDevice = devices.find((d) => d.name === lastDevice)?.name || devices[0].name;
  let curNumber = ''; // カメラ番号は毎回「－」スタート（誤入力防止）
  let shotCount = 0;

  // 1〜99 + 「－」(空文字)
  const numberOptions = ['', ...Array.from({ length: 99 }, (_, i) => String(i + 1))];

  const cam = document.createElement('div');
  cam.className = 'camera';
  cam.innerHTML = `
    <div class="cam-top">
      <button class="icon-btn light js-close" aria-label="閉じる">✕</button>
      <div class="cam-selectors">
        <select class="cam-select js-state">
          ${states.map((s) => `<option ${s.name === curState ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
        <select class="cam-select js-device">
          ${devices.map((d) => `<option ${d.name === curDevice ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
        </select>
        <select class="cam-select cam-select-num js-number" aria-label="カメラ番号">
          ${numberOptions.map((n) => `<option value="${n}" ${n === curNumber ? 'selected' : ''}>${n === '' ? '－' : n}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="cam-stage">
      <video class="cam-video" autoplay playsinline muted></video>
      <canvas class="cam-preview-canvas"></canvas>
      <div class="cam-flash"></div>
      <div class="cam-msg" hidden></div>
    </div>
    <div class="cam-preview-name js-preview"></div>
    <div class="cam-bottom">
      <span class="cam-count js-count"></span>
      <button class="cam-shutter js-shutter" aria-label="撮影"></button>
      <img class="cam-lastthumb js-lastthumb" hidden alt="直前の写真" />
    </div>
  `;
  document.body.appendChild(cam);

  const video = cam.querySelector('.cam-video');
  const flash = cam.querySelector('.cam-flash');
  const msg = cam.querySelector('.cam-msg');
  const previewEl = cam.querySelector('.js-preview');
  const countEl = cam.querySelector('.js-count');
  const shutter = cam.querySelector('.js-shutter');
  const lastThumb = cam.querySelector('.js-lastthumb');
  const stateSel = cam.querySelector('.js-state');
  const deviceSel = cam.querySelector('.js-device');
  const numberSel = cam.querySelector('.js-number');
  const previewCanvas = cam.querySelector('.cam-preview-canvas');
  // alpha:false で不透明モード。iOSでdrawImageが透明ピクセルを吐く問題への対策
  const previewCtx = previewCanvas.getContext('2d', { alpha: false });
  let stream = null;
  let lastThumbUrl = null;
  let rafId = null;

  // 1フレームをキャンバスへ描画。サイズ合わせはCSSのobject-fit:coverに任せる（iOSはスケール付きdrawImageで詰まりやすい）
  const drawOneFrame = () => {
    if (!stream || !stream.active) return false;
    if (video.readyState < 2 || video.videoWidth === 0) return false;
    if (previewCanvas.width !== video.videoWidth) {
      previewCanvas.width = video.videoWidth;
      previewCanvas.height = video.videoHeight;
    }
    try { previewCtx.drawImage(video, 0, 0); } catch (e) { /* iOSで稀に発生 */ }
    return true;
  };

  // 描画ループ：requestVideoFrameCallback優先（iOSで信頼性◎）、無ければrAF
  const startPreview = () => {
    if (typeof video.requestVideoFrameCallback === 'function') {
      const onVFC = () => {
        drawOneFrame();
        if (stream && stream.active) video.requestVideoFrameCallback(onVFC);
      };
      video.requestVideoFrameCallback(onVFC);
    } else {
      const loop = () => {
        drawOneFrame();
        if (stream && stream.active) rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }
  };

  const buildFilename = (seq) => {
    const numPart = curNumber ? `(${curNumber})` : '';
    return `${sanitize(curState)}_${sanitize(group.name)}_${sanitize(curDevice)}${numPart}_${seq}.jpg`;
  };

  const updatePreview = async () => {
    const seq = await Photos.nextSeq(group.id, curState, curDevice, curNumber);
    previewEl.textContent = buildFilename(seq);
  };

  const close = () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (lastThumbUrl) URL.revokeObjectURL(lastThumbUrl);
    cam.remove();
    route(); // ギャラリーを更新
  };

  cam.querySelector('.js-close').onclick = close;
  stateSel.onchange = () => {
    curState = stateSel.value;
    localStorage.setItem('lastState', curState);
    updatePreview();
  };
  deviceSel.onchange = () => {
    curDevice = deviceSel.value;
    localStorage.setItem('lastDevice', curDevice);
    updatePreview();
  };
  numberSel.onchange = () => {
    curNumber = numberSel.value;
    updatePreview();
  };

  const capture = async () => {
    if (!video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) return;

    const seq = await Photos.nextSeq(group.id, curState, curDevice, curNumber);
    const filename = buildFilename(seq);
    await Photos.add({
      id: uid(),
      groupId: group.id,
      state: curState,
      device: curDevice,
      number: curNumber,
      seq,
      filename,
      blob,
      createdAt: Date.now(),
    });

    // フィードバック
    flash.classList.add('on');
    setTimeout(() => flash.classList.remove('on'), 150);
    shotCount++;
    countEl.textContent = `${shotCount} 枚`;
    if (lastThumbUrl) URL.revokeObjectURL(lastThumbUrl);
    lastThumbUrl = URL.createObjectURL(blob);
    lastThumb.src = lastThumbUrl;
    lastThumb.hidden = false;
    updatePreview();
  };
  shutter.onclick = capture;

  // カメラ起動
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = stream;
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.disablePictureInPicture = true;
    if ('disableRemotePlayback' in video) video.disableRemotePlayback = true;
    const tryPlay = () => { const p = video.play(); if (p && p.catch) p.catch(() => {}); };
    video.onloadedmetadata = () => { tryPlay(); startPreview(); };
    tryPlay();
    startPreview();
  } catch (err) {
    msg.hidden = false;
    msg.innerHTML = `<div>カメラを起動できませんでした。<br>
      ・カメラの使用を「許可」してください<br>
      ・スマホで使う場合は <b>https</b> のURLが必要です<br>
      <small>(${escapeHtml(err.name || String(err))})</small></div>`;
    shutter.disabled = true;
  }

  await updatePreview();
}

/* ========== ZIP書き出し ========== */

async function exportSites(siteIds) {
  const files = [];
  const siteNames = [];
  for (const siteId of siteIds) {
    const site = await Sites.get(siteId);
    if (!site) continue;
    siteNames.push(site.name);
    const siteFolder = sanitize(site.name);
    const groups = await Groups.listBySite(siteId);
    for (const g of groups) {
      const groupFolder = sanitize(g.name);
      const photos = await Photos.listByGroup(g.id);
      for (const p of photos) {
        const buf = new Uint8Array(await p.blob.arrayBuffer());
        files.push({ name: `${siteFolder}/${groupFolder}/${p.filename}`, data: buf });
      }
    }
  }
  if (files.length === 0) {
    toast('書き出す写真がありません');
    return;
  }
  toast(`${files.length}枚をZIPに書き出し中…`);
  const blob = createZip(files);
  let zipName;
  if (siteIds.length === 1) {
    zipName = `${sanitize(siteNames[0])}.zip`;
  } else {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    zipName = `現場まとめ_${stamp}.zip`;
  }
  downloadBlob(blob, zipName);
}

/* ========== 設定 ========== */

async function renderSettings() {
  const [states, devices, cats] = await Promise.all([States.list(), Devices.list(), Categories.list()]);

  const section = (titleLabel, items, kind) => `
    <section class="settings-section">
      <h2>${titleLabel}</h2>
      <ul class="settings-list">
        ${items
          .map(
            (it) => `
          <li class="settings-row">
            <span class="settings-name">${escapeHtml(it.name)}</span>
            <button class="icon-btn js-edit" data-kind="${kind}" data-id="${it.id}" data-name="${escapeHtml(it.name)}">✎</button>
            <button class="icon-btn danger js-del" data-kind="${kind}" data-id="${it.id}">✕</button>
          </li>`
          )
          .join('')}
      </ul>
      <button class="btn btn-ghost js-add-item" data-kind="${kind}">＋ 追加</button>
    </section>`;

  app.innerHTML = `
    ${header({ title: '設定', back: '/' })}
    <main class="content">
      ${section('状態', states, 'state')}
      ${section('機器', devices, 'device')}
      ${section('場所カテゴリ', cats, 'category')}
      <p class="settings-hint">※ ここで追加・変更した項目は撮影画面や場所追加の候補に反映されます。</p>
      <section class="settings-section">
        <h2>メンテナンス</h2>
        <button class="btn btn-ghost js-force-update">アプリを強制更新</button>
        <p class="settings-hint">うまく動かない・更新が反映されないときに押すと、キャッシュを消して最新版を読み直します。<br>※ 撮影済みの写真や現場データは消えません。</p>
      </section>
      <p class="settings-version">version ${APP_VERSION}</p>
    </main>
  `;

  const api = { state: States, device: Devices, category: Categories };
  const labelOf = { state: '状態', device: '機器', category: '場所カテゴリ' };

  app.querySelectorAll('.js-add-item').forEach((btn) => {
    btn.onclick = async () => {
      const kind = btn.dataset.kind;
      const name = await promptDialog({ title: `${labelOf[kind]}を追加`, okLabel: '追加' });
      if (name) {
        await api[kind].add(name);
        route();
      }
    };
  });
  app.querySelectorAll('.js-edit').forEach((btn) => {
    btn.onclick = async () => {
      const kind = btn.dataset.kind;
      const name = await promptDialog({ title: '名前を変更', value: btn.dataset.name, okLabel: '保存' });
      if (name) {
        await api[kind].rename(btn.dataset.id, name);
        route();
      }
    };
  });
  app.querySelectorAll('.js-del').forEach((btn) => {
    btn.onclick = async () => {
      const kind = btn.dataset.kind;
      const ok = await confirmDialog({ title: '削除しますか？', okLabel: '削除', danger: true });
      if (ok) {
        await api[kind].remove(btn.dataset.id);
        route();
      }
    };
  });

  // 強制更新ボタン：SW登録解除＋キャッシュ全消去＋リロード
  app.querySelector('.js-force-update').onclick = async () => {
    const ok = await confirmDialog({
      title: 'アプリを強制更新',
      message: 'キャッシュを消して最新版を読み直します。写真と現場データは消えません。',
      okLabel: '更新',
    });
    if (!ok) return;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.warn('強制更新の途中で失敗', e);
    }
    location.reload();
  };
}

/* ========== 共通：行タップでナビゲート ========== */

function bindRowNav() {
  app.querySelectorAll('[data-go]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.js-more')) return; // ⋯ボタンは除外
      if (e.target.closest('[data-noclick]')) return; // チェックボックス等は除外
      go(row.dataset.go.slice(1));
    });
  });
}

/* ========== Service Worker 登録 ========== */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        // 画面が表に戻るたびに新版チェック（iOSのPWAでも更新を拾いやすくする）
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) reg.update();
        });
      })
      .catch((e) => console.warn('SW登録失敗', e));
  });
}
