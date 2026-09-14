/**
 * 施工図マシン配置
 * スケール: 1px = 1cm / 1マス=20cm / 共有ルーム対応
 */
const ROOMS = {
  "kyodo-2f": {
    title: "経堂 2F A",
    w: 3388,
    h: 2058,
    floor: "../floorplan/floor_2f.jpg",
  },
  "kyodo-2f-b": {
    title: "経堂 2F B",
    w: 3388,
    h: 2058,
    floor: "../floorplan/floor_2f.jpg",
  },
  "kyodo-2f-c": {
    title: "経堂 2F C",
    w: 3388,
    h: 2058,
    floor: "../floorplan/floor_2f.jpg",
  },
  "kyodo-3f": {
    title: "経堂 3F A",
    w: 2313,
    h: 1438,
    floor: "../floorplan/floor_3f.jpg",
    labeledCm: { w: 1960, h: 1140 },
    gridCm: 20,
  },
  "kyodo-3f-b": {
    title: "経堂 3F B",
    w: 2313,
    h: 1438,
    floor: "../floorplan/floor_3f.jpg",
    labeledCm: { w: 1960, h: 1140 },
    gridCm: 20,
  },
  "kyodo-3f-c": {
    title: "経堂 3F C",
    w: 2313,
    h: 1438,
    floor: "../floorplan/floor_3f.jpg",
    labeledCm: { w: 1960, h: 1140 },
    gridCm: 20,
  },
};
const DEFAULT_ROOM = "kyodo-2f";
let PLAN_W = ROOMS[DEFAULT_ROOM].w;
let PLAN_H = ROOMS[DEFAULT_ROOM].h;
const AUTHOR_KEY = "kyodo-floorplan-author";
const LAST_GOOD_KEY = "kyodo-floorplan-last";
const PLACE_BASE = "../floorplan/machines/place/";
const PREVIEW_BASE = "../floorplan/machines/preview/";
const MACHINE_ADD_API = "/api/machine-add";

function withArtVer(url, extra = "") {
  if (!url) return "";
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}v=${ART_VER}${extra ? `&${extra}` : ""}`;
}

function machinePreviewUrl(m) {
  if (m?.preview_url) return withArtVer(m.preview_url);
  if (m?.has_art !== false && m?.preview_file) {
    return `${encodeURI(PREVIEW_BASE + m.preview_file)}?v=${ART_VER}`;
  }
  return "";
}

function machinePlaceUrl(m) {
  const bust = m?.updatedAt ? `u=${encodeURIComponent(String(m.updatedAt))}` : "";
  if (m?.place_url) return withArtVer(m.place_url, bust);
  if (m?.has_art !== false && m?.place_file) {
    return `${encodeURI(PLACE_BASE + m.place_file)}?v=${ART_VER}${bust ? `&${bust}` : ""}`;
  }
  return "";
}
/** 画像差し替え時にブラウザ/CDNキャッシュを切る */
const ART_VER = "20260914cat";
const CSV_URL = "../floorplan/machines.csv";
const CATALOG_URL = "../floorplan/machines_catalog.json";
const MACHINES_API = "/api/machines";
const DEFAULT_CLEARANCE_CM = 80;
const GRID_CM = 20;
const SNAP_SCREEN_PX = 10;
const MAX_UNDO = 60;
const AUTOSAVE_MS = 4000;

const ZONE_COLORS = [
  { id: "yellow", fill: "rgba(245,215,110,0.45)", chip: "#f5d76e", name: "黄" },
  { id: "pink", fill: "rgba(245,169,192,0.45)", chip: "#f5a9c0", name: "桃" },
  { id: "peach", fill: "rgba(245,203,167,0.45)", chip: "#f5cba7", name: "橙" },
  { id: "green", fill: "rgba(169,223,191,0.45)", chip: "#a9dfbf", name: "緑" },
  { id: "blue", fill: "rgba(174,214,241,0.45)", chip: "#aed6f1", name: "青" },
  { id: "gray", fill: "rgba(213,216,220,0.5)", chip: "#d5d8dc", name: "灰" },
  { id: "lavender", fill: "rgba(210,180,230,0.45)", chip: "#d2b4e6", name: "紫" },
  { id: "teal", fill: "rgba(130,210,210,0.45)", chip: "#82d2d2", name: "青緑" },
  { id: "coral", fill: "rgba(245,160,150,0.45)", chip: "#f5a096", name: "赤" },
  { id: "cream", fill: "rgba(250,240,210,0.5)", chip: "#faf0d2", name: "クリーム" },
];

const state = {
  catalog: [],
  items: [],
  zones: [],
  filter: "all",
  source: "existing",
  query: "",
  view: { scale: 0.25, ox: 40, oy: 40 },
  panning: false,
  panStart: null,
  spaceDown: false,
  snapGuides: { xs: [], ys: [] },
  roomId: DEFAULT_ROOM,
  history: [],
  updatedAt: null,
  updatedBy: null,
  selectedUids: new Set(),
  selectedZoneUids: new Set(),
  clipboard: [],
  marquee: null,
  dragPrimaryUid: null,
  dragStartPlan: null,
  dragOrigins: null,
  undoStack: [],
  dragMoved: false,
  lastTap: { uid: null, t: 0 },
  lastZoneTap: { uid: null, t: 0 },
  zoneTool: null, // null | 'rect' | 'circle'
  zoneColor: ZONE_COLORS[5].fill,
  zoneDraft: null,
  zoneEditUid: null,
  zoneResize: null,
  zoneLabelDrag: null,
  zoneMove: null,
  zonePointerMoved: false,
  /** 他フロアに置いてある台数（id -> count）。2F+3F合算の残数計算用 */
  peerCounts: {},
  dirty: false,
  autosaveTimer: null,
  autosaveInFlight: false,
  needsResave: false,
  saveRetryCount: 0,
  lastSavedFp: "",
  saveQueue: Promise.resolve(),
  tabId: crypto.randomUUID(),
  saveStatus: "saved", // saved | dirty | saving | conflict | error
  conflictPending: false,
  conflictServerData: null,
  /** パレットでフォーカス中のマシンID（変更用） */
  paletteFocusId: null,
};

const el = {
  viewport: document.getElementById("viewport"),
  stage: document.getElementById("stage"),
  zonesLayer: document.getElementById("zones-layer"),
  layer: document.getElementById("machines-layer"),
  guides: document.getElementById("guides-layer"),
  palette: document.getElementById("palette"),
  search: document.getElementById("search"),
  filters: document.getElementById("filters"),
  sourceFilters: document.getElementById("source-filters"),
  author: document.getElementById("author"),
  history: document.getElementById("history"),
  statusSave: document.getElementById("status-save"),
  statusRoom: document.getElementById("status-room"),
  statusScale: document.getElementById("status-scale"),
  statusCount: document.getElementById("status-count"),
  statusSel: document.getElementById("status-sel"),
  statusLink: document.getElementById("status-link"),
  conflictModal: document.getElementById("conflict-modal"),
  conflictKeepMine: document.getElementById("conflict-keep-mine"),
  conflictTakeServer: document.getElementById("conflict-take-server"),
  conflictLater: document.getElementById("conflict-later"),
  floorSelect: document.getElementById("floor-select"),
  brandTitle: document.getElementById("brand-title"),
  floor: document.getElementById("floor"),
  zoneLabel: document.getElementById("zone-label"),
  zoneFreetext: document.getElementById("zone-freetext"),
  zoneColors: document.getElementById("zone-colors"),
  btnZoneRect: document.getElementById("btn-zone-rect"),
  btnZoneOff: document.getElementById("btn-zone-off"),
  btnZoneVertical: document.getElementById("btn-zone-vertical"),
  btnZoneFlipX: document.getElementById("btn-zone-flip-x"),
  btnZoneFlipY: document.getElementById("btn-zone-flip-y"),
  btnRotate: document.getElementById("btn-rotate"),
  btnLock: document.getElementById("btn-lock"),
  btnEditMachine: document.getElementById("btn-edit-machine"),
  btnSave: document.getElementById("btn-save"),
  btnAddMachine: document.getElementById("btn-add-machine"),
  addMachineModal: document.getElementById("add-machine-modal"),
  addMachineForm: document.getElementById("add-machine-form"),
  addMachineCancel: document.getElementById("add-machine-cancel"),
  addMachineImage: document.getElementById("add-machine-image"),
  addMachinePreview: document.getElementById("add-machine-preview"),
  addMachineTitle: document.getElementById("add-machine-title"),
  addMachineLead: document.getElementById("add-machine-lead"),
  addMachineEditId: document.getElementById("add-machine-edit-id"),
  addMachineImageReq: document.getElementById("add-machine-image-req"),
  addMachineImageHint: document.getElementById("add-machine-image-hint"),
  addMachineSubmit: document.getElementById("add-machine-submit"),
};

function uid() {
  return crypto.randomUUID();
}

function normalizeRoomId(raw) {
  let id = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 48);
  if (id === "kyodo-2f-a") id = "kyodo-2f";
  if (id === "kyodo-3f-a") id = "kyodo-3f";
  return id;
}

function roomFromUrl() {
  const q = new URLSearchParams(location.search).get("room");
  const id = normalizeRoomId(q || DEFAULT_ROOM);
  return ROOMS[id] ? id : DEFAULT_ROOM;
}

function roomConfig(roomId = state.roomId) {
  return ROOMS[roomId] || ROOMS[DEFAULT_ROOM];
}

function applyRoomConfig(roomId) {
  const conf = roomConfig(roomId);
  PLAN_W = conf.w;
  PLAN_H = conf.h;
  document.documentElement.style.setProperty("--plan-w", `${conf.w}px`);
  document.documentElement.style.setProperty("--plan-h", `${conf.h}px`);
  if (el.stage) {
    el.stage.style.width = `${conf.w}px`;
    el.stage.style.height = `${conf.h}px`;
  }
  if (el.floor) {
    el.floor.src = `${conf.floor}?v=${ART_VER}`;
    el.floor.width = conf.w;
    el.floor.height = conf.h;
    el.floor.alt = conf.title;
  }
  if (el.brandTitle) el.brandTitle.textContent = conf.title;
  if (el.floorSelect) el.floorSelect.value = roomId;
  document.title = `${conf.title} 配置`;
}

function shareUrl() {
  const u = new URL(location.href);
  u.searchParams.set("room", state.roomId);
  u.hash = "";
  return u.toString();
}

function clearPlacementState() {
  state.items = [];
  state.zones = [];
  state.history = [];
  state.undoStack = [];
  state.selectedUids = new Set();
  state.selectedZoneUids = new Set();
  state.clipboard = [];
  state.updatedAt = null;
  state.updatedBy = null;
  clearZoneEdit();
}

function inPlanBounds(it) {
  const x = Number(it.x);
  const y = Number(it.y);
  if (![x, y].every(Number.isFinite)) return false;
  // 他フロア配置の混入防止（座標が大きく外れていれば捨てる）
  return x > -40 && y > -40 && x < PLAN_W + 40 && y < PLAN_H + 40;
}

async function switchRoom(nextRoomId) {
  const next = String(nextRoomId || "").trim();
  if (!ROOMS[next] || next === state.roomId) return;
  // 先に空にしてから切替（2Fマシンが3Fに残って見えるのを防ぐ）
  clearPlacementState();
  renderMachines();
  renderZones();
  renderHistory();
  updateChrome();

  state.roomId = next;
  applyRoomConfig(next);
  const url = shareUrl();
  if (url !== location.href) history.replaceState(null, "", url);

  fitView();
  await loadCloud(true);
  fitView();
  updateChrome();
}

function authorName() {
  return (el.author?.value || "").trim().slice(0, 40) || "anonymous";
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.map((line) => {
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i];
    });
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      qty: Number(row.qty) || 1,
      width_cm: Number(row.width_cm),
      length_cm: Number(row.length_cm),
      module_width_cm: Number(row.module_width_cm),
      module_length_cm: Number(row.module_length_cm),
      place_px_w: Number(row.place_px_w),
      place_px_h: Number(row.place_px_h),
      place_file: row.place_file,
      preview_file: row.preview_file,
    };
  });
}

function findMachine(id) {
  return state.catalog.find((m) => m.id === id);
}

function isSheetBackedExtra(id) {
  return String(id || "").startsWith("extra_");
}

function itemOnFloor(item) {
  if (!item || item.hidden) return false;
  if (!isSheetBackedExtra(item.id)) return true;
  return !!findMachine(item.id);
}

function placedCount(id) {
  const here = state.items.filter((i) => i.id === id && itemOnFloor(i)).length;
  const peer = Number(state.peerCounts?.[id]) || 0;
  return here + peer;
}

function remainingOf(id) {
  const m = findMachine(id);
  if (!m) return 0;
  return Math.max(0, (Number(m.qty) || 0) - placedCount(id));
}

function canPlaceMore(id, n = 1) {
  return remainingOf(id) >= n;
}

/** 同じフロアの他パターン＋別フロア全パターンの配置台数（残数は館内合算） */
async function refreshPeerCounts() {
  const counts = {};
  const rooms = Object.keys(ROOMS).filter((id) => id !== state.roomId);
  await Promise.all(
    rooms.map(async (roomId) => {
      try {
        const res = await fetch(`/api/room?id=${encodeURIComponent(roomId)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json.ok) return;
        const items = Array.isArray(json.data?.items) ? json.data.items : [];
        for (const it of items) {
          if (!it?.id || it.hidden) continue;
          counts[it.id] = (counts[it.id] || 0) + 1;
        }
      } catch (err) {
        console.warn("peer room load failed", roomId, err);
      }
    })
  );
  state.peerCounts = counts;
}

function applyView() {
  const { scale, ox, oy } = state.view;
  el.stage.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
  el.statusScale.textContent = `${Math.round(scale * 100)}%`;
}

function fitView() {
  const rect = el.viewport.getBoundingClientRect();
  // 図面ボックス（アスペクト固定）を崩さず、画面内に全体が入るよう余白を多めに取る
  const pad = state.roomId === "kyodo-3f" ? 56 : 24;
  const sx = (rect.width - pad * 2) / PLAN_W;
  const sy = (rect.height - pad * 2) / PLAN_H;
  const scale = Math.max(0.05, Math.min(sx, sy));
  state.view.scale = scale;
  state.view.ox = (rect.width - PLAN_W * scale) / 2;
  state.view.oy = (rect.height - PLAN_H * scale) / 2;
  applyView();
}

function clientToPlan(clientX, clientY) {
  const rect = el.viewport.getBoundingClientRect();
  const x = (clientX - rect.left - state.view.ox) / state.view.scale;
  const y = (clientY - rect.top - state.view.oy) / state.view.scale;
  return { x, y };
}

function itemClearance(machine, item) {
  return Number(machine?.clearance_cm ?? item?.clearance_cm ?? DEFAULT_CLEARANCE_CM) || DEFAULT_CLEARANCE_CM;
}

function itemBodySize(machine, item) {
  const clear = itemClearance(machine, item);
  // カタログ（変更後）の寸法を最優先。配置時に保存した place_px_* はフォールバックのみ
  const bw = Number(machine?.width_cm) || Math.max(20, (Number(item?.place_px_w) || 200) - clear * 2);
  const bh = Number(machine?.length_cm) || Math.max(20, (Number(item?.place_px_h) || 200) - clear * 2);
  const mw =
    Number(machine?.place_px_w) ||
    Number(machine?.module_width_cm) ||
    bw + clear * 2;
  const mh =
    Number(machine?.place_px_h) ||
    Number(machine?.module_length_cm) ||
    bh + clear * 2;
  return { bw, bh, clear, mw, mh };
}

function itemSize(item, machine) {
  const body = itemBodySize(machine, item);
  const w = item.trimmed ? body.bw : body.mw;
  const h = item.trimmed ? body.bh : body.mh;
  const swapped = (item.rot || 0) % 180 !== 0;
  return { bw: swapped ? h : w, bh: swapped ? w : h, body };
}

function clampItem(item, machine) {
  const { bw, bh } = itemSize(item, machine || {});
  item.x = Math.min(Math.max(0, item.x), PLAN_W - bw);
  item.y = Math.min(Math.max(0, item.y), PLAN_H - bh);
}

/** 寸法変更後も配置の中心を維持（左上基準で伸びてズレるのを防ぐ） */
function snapshotPlacementCenters() {
  return state.items.map((it) => {
    const m = findMachine(it.id);
    const { bw, bh } = itemSize(it, m);
    return { uid: it.uid, id: it.id, cx: it.x + bw / 2, cy: it.y + bh / 2 };
  });
}

function restorePlacementCenters(snaps) {
  if (!Array.isArray(snaps) || !snaps.length) return;
  for (const s of snaps) {
    const it = state.items.find((i) => i.uid === s.uid);
    if (!it) continue;
    const m = findMachine(it.id);
    if (!m) continue;
    const { bw, bh } = itemSize(it, m);
    it.x = s.cx - bw / 2;
    it.y = s.cy - bh / 2;
    clampItem(it, m);
  }
}

/** 変更後のカタログ寸法を、図面上の同IDマシンへ即反映（見た目の大きさ更新） */
function syncPlacedItemsToCatalog(machineId) {
  const m = findMachine(machineId);
  if (!m || !machineId) return 0;
  let n = 0;
  for (const it of state.items) {
    if (it.id !== machineId) continue;
    it.place_px_w = m.place_px_w;
    it.place_px_h = m.place_px_h;
    it.clearance_cm = m.clearance_cm || DEFAULT_CLEARANCE_CM;
    n += 1;
  }
  return n;
}

function normalizeCatalogMachine(m) {
  return {
    ...m,
    source: m.source === "new" ? "new" : "existing",
    genre: m.genre || (m.category === "cardio" ? "cardio" : m.category === "freeweight" ? "freeweight" : "stack"),
    has_art: m.has_art !== false && (!!m.place_url || !!m.place_file),
    overridden: !!m.overridden || m.status === "寸法上書き",
    place_px_w: m.place_px_w || m.module_width_cm || m.width_cm + DEFAULT_CLEARANCE_CM * 2,
    place_px_h: m.place_px_h || m.module_length_cm || m.length_cm + DEFAULT_CLEARANCE_CM * 2,
    module_width_cm: m.module_width_cm || m.width_cm + DEFAULT_CLEARANCE_CM * 2,
    module_length_cm: m.module_length_cm || m.length_cm + DEFAULT_CLEARANCE_CM * 2,
    place_file: m.place_file || (m.source === "new" ? "" : `${m.id}_place.png`),
    preview_file: m.preview_file || (m.source === "new" ? "" : `${m.id}_preview.png`),
    place_url: m.place_url || "",
    preview_url: m.preview_url || "",
    link: m.link || "",
  };
}

/** API応答を待たずにカタログを先に更新（即時に図面サイズを変える） */
function upsertCatalogMachine(machine) {
  if (!machine?.id) return null;
  const mapped = normalizeCatalogMachine(machine);
  const i = state.catalog.findIndex((m) => m.id === mapped.id);
  if (i >= 0) state.catalog[i] = { ...state.catalog[i], ...mapped, overridden: true };
  else state.catalog.unshift(mapped);
  return state.catalog.find((m) => m.id === mapped.id) || mapped;
}

function itemEdges(item, machine) {
  const { bw, bh } = itemSize(item, machine);
  return {
    left: item.x,
    right: item.x + bw,
    top: item.y,
    bottom: item.y + bh,
    cx: item.x + bw / 2,
    cy: item.y + bh / 2,
    bw,
    bh,
  };
}

function pushUndo() {
  const snap = JSON.stringify({
    items: state.items,
    zones: state.zones,
    selectedUids: [...state.selectedUids],
    selectedZoneUids: [...state.selectedZoneUids],
  });
  const last = state.undoStack[state.undoStack.length - 1];
  if (last === snap) return;
  state.undoStack.push(snap);
  if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
}

function contentFingerprint(items = state.items, zones = state.zones) {
  return JSON.stringify({ items, zones });
}

function updateDirtyUi() {
  if (el.btnSave) {
    el.btnSave.classList.toggle("is-dirty", !!state.dirty);
    el.btnSave.title = state.dirty ? "未保存の変更あり" : "保存済み";
    if (state.autosaveInFlight || state.saveStatus === "saving") {
      el.btnSave.textContent = "保存中…";
    } else if (state.dirty && !el.btnSave.classList.contains("is-saving")) {
      el.btnSave.textContent = "保存*";
    } else if (!el.btnSave.classList.contains("is-saving")) {
      el.btnSave.textContent = "保存";
    }
  }
  updateSaveStatusUi();
}

function updateSaveStatusUi() {
  if (!el.statusSave) return;
  const map = {
    saved: { text: "保存済み", cls: "is-saved" },
    dirty: { text: "未保存", cls: "is-dirty" },
    saving: { text: "保存中…", cls: "is-saving" },
    conflict: { text: "競合あり", cls: "is-conflict" },
    error: { text: "保存失敗", cls: "is-error" },
  };
  let key = state.saveStatus;
  if (state.conflictPending) key = "conflict";
  else if (state.autosaveInFlight) key = "saving";
  else if (state.dirty && key !== "error") key = "dirty";
  else if (!state.dirty && key !== "error" && key !== "conflict") key = "saved";
  const info = map[key] || map.saved;
  el.statusSave.textContent = info.text;
  el.statusSave.className = `status-save ${info.cls}`;
  el.statusSave.title =
    key === "conflict"
      ? "他画面と保存が競合しています"
      : key === "dirty"
        ? "未保存の変更あり（ドラッグ終了後すぐ保存）"
        : key === "saving"
          ? "クラウドへ保存中"
          : key === "error"
            ? "保存に失敗しました"
            : "クラウドに保存済み";
}

function markDirty({ immediate = false } = {}) {
  if (contentFingerprint() === state.lastSavedFp) {
    state.dirty = false;
    if (!state.conflictPending) state.saveStatus = "saved";
    updateDirtyUi();
    return;
  }
  state.dirty = true;
  if (!state.conflictPending) state.saveStatus = "dirty";
  updateDirtyUi();
  if (immediate) saveSoon();
  else scheduleAutosave();
}

function saveSoon() {
  if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
  // 連続操作は少し待ってまとめて送る（待ちすぎず、連打POSTも避ける）
  state.autosaveTimer = setTimeout(() => {
    state.autosaveTimer = null;
    runAutosave();
  }, 280);
}

function touchTabLock() {
  try {
    localStorage.setItem(
      `kyodo-floorplan-lock:${state.roomId}`,
      JSON.stringify({ tabId: state.tabId, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

function isPrimaryTab() {
  try {
    const raw = localStorage.getItem(`kyodo-floorplan-lock:${state.roomId}`);
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    if (!parsed?.tabId) return true;
    // 8秒以上無更新ならロック奪取可
    if (Date.now() - Number(parsed.at || 0) > 8000) return true;
    return parsed.tabId === state.tabId;
  } catch {
    return true;
  }
}

function isBusyForAutosave() {
  // 保存中でも編集は続行。ドラッグ等の操作中だけ送らない
  return !!(
    state.zoneMove ||
    state.zoneResize ||
    state.zoneLabelDrag ||
    state.zoneDraft ||
    state.dragPrimaryUid ||
    state.panning ||
    state.marquee
  );
}

function scheduleAutosave() {
  if (state.conflictPending) return;
  if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(() => {
    state.autosaveTimer = null;
    runAutosave();
  }, AUTOSAVE_MS);
}

function runAutosave() {
  if (state.conflictPending) {
    updateSaveStatusUi();
    return;
  }
  if (contentFingerprint() === state.lastSavedFp) {
    state.dirty = false;
    state.needsResave = false;
    state.saveStatus = "saved";
    updateDirtyUi();
    return;
  }
  if (isBusyForAutosave()) {
    state.needsResave = true;
    scheduleAutosave();
    return;
  }
  if (state.autosaveInFlight) {
    // 飛行中の追加編集は「終わったら最新をもう一回」に合流
    state.needsResave = true;
    updateSaveStatusUi();
    return;
  }
  if (!isPrimaryTab()) {
    // 他タブが編集中ならこのタブは自動保存しない（上書き事故防止）
    scheduleAutosave();
    return;
  }
  touchTabLock();
  enqueueSave({ auto: true }).catch((err) => {
    console.error(err);
    state.dirty = true;
    state.saveStatus = "error";
    updateDirtyUi();
    showSaveToast("自動保存に失敗しました", { error: true });
    scheduleAutosave();
  });
}

function enqueueSave(opts = {}) {
  state.saveQueue = state.saveQueue
    .catch(() => {})
    .then(() => saveCloud(opts));
  return state.saveQueue;
}

function fingerprintOfRoomData(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const zones = Array.isArray(data?.zones) ? data.zones : [];
  return contentFingerprint(items, zones);
}

/** 自動保存の 409 を、同じ人の連打・Blob遅延として握りつぶして再送する */
async function handleAutosaveConflict(json, { sentFp, force }) {
  const serverData = json?.data || null;
  const serverFp = serverData ? fingerprintOfRoomData(serverData) : "";
  const serverAt = serverData?.updatedAt ? String(serverData.updatedAt) : "";
  const localAt = state.updatedAt ? String(state.updatedAt) : "";

  // 自分がさっき保存した内容 / 今送った内容と同じ → 版番号だけ合わせて続行
  if (serverFp && (serverFp === sentFp || serverFp === state.lastSavedFp)) {
    if (serverAt) state.updatedAt = serverAt;
    if (serverData?.updatedBy) state.updatedBy = serverData.updatedBy;
    if (serverFp === sentFp) state.lastSavedFp = sentFp;
    state.saveRetryCount = 0;
    if (contentFingerprint() !== state.lastSavedFp) {
      state.dirty = true;
      state.needsResave = true;
      state.saveStatus = "dirty";
      updateDirtyUi();
      saveSoon();
    } else {
      state.dirty = false;
      state.needsResave = false;
      state.saveStatus = "saved";
      updateDirtyUi();
    }
    return true;
  }

  // サーバ読取がクライアント既知より古い（Blob遅延）→ 強制でもう一回
  if (localAt && serverAt && serverAt < localAt && state.saveRetryCount < 2) {
    state.saveRetryCount += 1;
    await saveCloud({ auto: true, force: true });
    return true;
  }

  // まだリトライ余地あり：サーバ版番号だけ取り込み、ローカル編集は保持して再送
  if (!force && state.saveRetryCount < 2) {
    if (serverAt) state.updatedAt = serverAt;
    state.saveRetryCount += 1;
    await saveCloud({ auto: true, force: state.saveRetryCount >= 2 });
    return true;
  }

  return false;
}

function undoLast() {
  const raw = state.undoStack.pop();
  if (!raw) {
    flash("戻すなし");
    return;
  }
  try {
    const data = JSON.parse(raw);
    state.items = Array.isArray(data.items) ? data.items : [];
    state.zones = Array.isArray(data.zones) ? data.zones : [];
    state.selectedUids = new Set(data.selectedUids || []);
    state.selectedZoneUids = new Set(data.selectedZoneUids || []);
    renderZones();
    renderMachines();
    markDirty();
    flash("戻した");
  } catch {
    flash("戻す失敗");
  }
}

function toggleTrim(uidVal) {
  const item = state.items.find((i) => i.uid === uidVal);
  const m = item && findMachine(item.id);
  if (!item || !m) return;
  pushUndo();
  const clear = itemClearance(m, item);
  if (!item.trimmed) {
    item.x += clear;
    item.y += clear;
    item.trimmed = true;
    item.clearance_cm = clear;
  } else {
    item.x -= clear;
    item.y -= clear;
    item.trimmed = false;
  }
  clampItem(item, m);
  state.selectedUids = new Set([uidVal]);
  renderMachines();
  markDirty();
  flash(item.trimmed ? "切取" : "区画戻し");
}

function clearGuides() {
  state.snapGuides = { xs: [], ys: [] };
  if (el.guides) el.guides.innerHTML = "";
}

function drawGuides(xs, ys) {
  state.snapGuides = { xs, ys };
  if (!el.guides) return;
  el.guides.innerHTML = [
    ...xs.map((x) => `<div class="guide-v" style="left:${x}px"></div>`),
    ...ys.map((y) => `<div class="guide-h" style="top:${y}px"></div>`),
  ].join("");
}

/** Canva風: 他マシンの辺・中心、図面端、20cm格子に吸着 */
function snapPosition(item, machine) {
  const self = itemEdges(item, machine);
  const thresh = SNAP_SCREEN_PX / Math.max(state.view.scale, 0.01);
  const xTargets = [0, PLAN_W, PLAN_W / 2];
  const yTargets = [0, PLAN_H, PLAN_H / 2];

  for (const other of state.items) {
    if (other.uid === item.uid || other.hidden) continue;
    const om = findMachine(other.id);
    if (!om) continue;
    const e = itemEdges(other, om);
    xTargets.push(e.left, e.right, e.cx);
    yTargets.push(e.top, e.bottom, e.cy);
  }

  // 格子（近いものだけ候補化するため現在位置付近）
  const gridPad = thresh + GRID_CM;
  for (let gx = Math.max(0, Math.floor((self.left - gridPad) / GRID_CM) * GRID_CM); gx <= Math.min(PLAN_W, self.right + gridPad); gx += GRID_CM) {
    xTargets.push(gx);
  }
  for (let gy = Math.max(0, Math.floor((self.top - gridPad) / GRID_CM) * GRID_CM); gy <= Math.min(PLAN_H, self.bottom + gridPad); gy += GRID_CM) {
    yTargets.push(gy);
  }

  let bestDx = 0;
  let bestDy = 0;
  let bestAbsX = thresh + 1;
  let bestAbsY = thresh + 1;
  const guideXs = new Set();
  const guideYs = new Set();

  const tryX = (value, edge) => {
    const dx =
      edge === "left" ? value - self.left :
      edge === "right" ? value - self.right :
      value - self.cx;
    const adx = Math.abs(dx);
    if (adx <= thresh && adx < bestAbsX) {
      bestAbsX = adx;
      bestDx = dx;
    }
  };
  const tryY = (value, edge) => {
    const dy =
      edge === "top" ? value - self.top :
      edge === "bottom" ? value - self.bottom :
      value - self.cy;
    const ady = Math.abs(dy);
    if (ady <= thresh && ady < bestAbsY) {
      bestAbsY = ady;
      bestDy = dy;
    }
  };

  for (const t of xTargets) {
    tryX(t, "left");
    tryX(t, "right");
    tryX(t, "cx");
  }
  for (const t of yTargets) {
    tryY(t, "top");
    tryY(t, "bottom");
    tryY(t, "cy");
  }

  if (bestAbsX <= thresh) item.x += bestDx;
  if (bestAbsY <= thresh) item.y += bestDy;

  // 吸着後の辺をガイド表示
  const after = itemEdges(item, machine);
  const markX = (v) => {
    if (Math.abs(after.left - v) < 0.51 || Math.abs(after.right - v) < 0.51 || Math.abs(after.cx - v) < 0.51) {
      guideXs.add(Math.round(v));
    }
  };
  const markY = (v) => {
    if (Math.abs(after.top - v) < 0.51 || Math.abs(after.bottom - v) < 0.51 || Math.abs(after.cy - v) < 0.51) {
      guideYs.add(Math.round(v));
    }
  };
  if (bestAbsX <= thresh) xTargets.forEach(markX);
  if (bestAbsY <= thresh) yTargets.forEach(markY);

  drawGuides([...guideXs], [...guideYs]);
}

const GENRE_LABEL = {
  cardio: "有酸素",
  hyrox: "HYROX",
  stack: "レジスタンス",
  plate: "PL",
  freeweight: "FW",
  pilates: "ピラティス",
};

function machineGenre(m) {
  if (m?.genre) return m.genre;
  if (m?.category === "cardio") return "cardio";
  if (m?.category === "freeweight") return "freeweight";
  return "stack";
}

function machineSource(m) {
  return m?.source === "new" ? "new" : "existing";
}

function isWebExtra(m) {
  return String(m?.id || "").startsWith("extra_") || m?.status === "WEB追加";
}

function isNewMachine(m) {
  return machineSource(m) === "new" || isWebExtra(m);
}

/** 変更対象ID: 図面上で1台選択 > パレットフォーカス */
function editableMachineId() {
  const sels = selectedItems();
  if (sels.length === 1) return sels[0].id;
  if (state.paletteFocusId && findMachine(state.paletteFocusId)) return state.paletteFocusId;
  return null;
}

function renderPalette() {
  const q = state.query.trim().toLowerCase();
  const placedIds = new Set(state.items.filter((i) => itemOnFloor(i)).map((i) => i.id));
  const list = state.catalog.filter((m) => {
    const rem = remainingOf(m.id);
    const onFloor = placedIds.has(m.id);
    // 残0でも図面に置いてある機種は一覧に残す（寸法変更後に消えて見えない対策）
    if (rem <= 0 && !onFloor) return false;
    if (state.filter === "web") return isWebExtra(m);
    // 専用カテゴリは既存/新規タブをまたいで表示し、空の一覧にしない。
    if (!["pilates", "hyrox", "web"].includes(state.filter) && machineSource(m) !== state.source) {
      return false;
    }
    if (state.filter !== "all" && state.filter !== "web" && machineGenre(m) !== state.filter) {
      return false;
    }
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      String(m.zone || "").toLowerCase().includes(q)
    );
  });
  // WEB追加・編集済を先頭、図面にあるものを優先
  list.sort((a, b) => {
    const score = (m) =>
      (isWebExtra(m) ? 4 : 0) + (m.overridden ? 2 : 0) + (placedIds.has(m.id) ? 1 : 0);
    return score(b) - score(a);
  });

  if (!list.length) {
    el.palette.innerHTML = `<div class="palette-empty">該当マシンがありません。<br/>「すべて」を選ぶか、検索してください。</div>`;
    return;
  }

  el.palette.innerHTML = list
    .map((m) => {
      const rem = remainingOf(m.id);
      const onFloor = placedIds.has(m.id);
      const g = GENRE_LABEL[machineGenre(m)] || "";
      const prev = machinePreviewUrl(m);
      const thumb = prev
        ? `<img src="${escapeHtml(prev)}" alt="" loading="lazy" />`
        : `<div class="card-ph">${escapeHtml(g || "新規")}</div>`;
      const qtyLabel =
        rem <= 0 && onFloor
          ? `${m.width_cm}×${m.length_cm} · 配置済（変更可）`
          : m.source === "new" && m.sheet_qty === 0
            ? `検討用 · ${m.width_cm}×${m.length_cm}`
            : `${m.width_cm}×${m.length_cm}（区画${m.module_width_cm}×${m.module_length_cm}）· 残 ${rem}/${m.qty}`;
      const badge = isNewMachine(m)
        ? `<span class="card-badge is-new">N</span>`
        : m.overridden
          ? `<span class="card-badge is-edit">編集済</span>`
          : "";
      const focused = state.paletteFocusId === m.id ? " is-focused" : "";
      const exhausted = rem <= 0 ? " is-exhausted" : "";
      return `
      <div class="card${isNewMachine(m) ? " is-web-extra" : ""}${m.overridden ? " is-overridden" : ""}${focused}${exhausted}" draggable="${rem > 0 ? "true" : "false"}" data-id="${m.id}">
        ${badge}
        ${thumb}
        <div class="meta">
          <div class="name">${escapeHtml(m.name)}</div>
          <div class="dim">${escapeHtml(qtyLabel)}</div>
        </div>
      </div>`;
    })
    .join("");

  el.palette.querySelectorAll(".card").forEach((card) => {
    let dragged = false;
    card.addEventListener("dragstart", (e) => {
      if (!canPlaceMore(card.dataset.id)) {
        e.preventDefault();
        return;
      }
      dragged = true;
      e.dataTransfer.setData("text/machine-id", card.dataset.id);
      e.dataTransfer.effectAllowed = "copy";
    });
    card.addEventListener("click", (ev) => {
      if (dragged) {
        dragged = false;
        return;
      }
      const m = findMachine(card.dataset.id);
      if (!m) return;
      state.paletteFocusId = m.id;
      // 図面上の同IDを選択（変更しやすく）
      const onFloor = state.items.filter((i) => i.id === m.id && itemOnFloor(i));
      if (onFloor.length) {
        state.selectedUids = new Set(onFloor.map((i) => i.uid));
        state.selectedZoneUids = new Set();
        renderMachines();
      }
      updateChrome();
      renderPalette();
      if (ev.altKey) {
        openEditMachineModal(m.id);
        return;
      }
      if (!canPlaceMore(m.id)) {
        flash("配置済です。上の「変更」で寸法・内容を編集できます");
        return;
      }
      placeMachine(m.id, PLAN_W / 2 - m.place_px_w / 2, PLAN_H / 2 - m.place_px_h / 2);
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatMeters(cm) {
  const n = Number(cm);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${(n / 100).toFixed(2)}m`;
}

/** 旧Canva風の縦横寸法オーバーレイ（枠サイズ＝実寸cmのまま） */
function buildDimOverlay(wCm, lCm) {
  const w = Math.max(1, Math.round(wCm));
  const l = Math.max(1, Math.round(lCm));
  const wLabel = formatMeters(w);
  const lLabel = formatMeters(l);
  const pad = Math.max(6, Math.min(14, Math.round(Math.min(w, l) * 0.04)));
  const font = Math.max(9, Math.min(14, Math.round(Math.min(w, l) * 0.045)));
  const tick = Math.max(4, Math.round(font * 0.45));
  const labelSpace = Math.max(16, Math.round(font * 1.6));
  const yW = l - pad - labelSpace;
  const xL = w - pad;
  const pillW = Math.max(36, Math.round(font * 3.2));
  const pillH = Math.max(14, Math.round(font * 1.35));

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "machine-dims");
  svg.setAttribute("viewBox", `0 0 ${w} ${l}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `
    <!-- 幅（下） -->
    <line x1="${pad}" y1="${yW}" x2="${w - pad}" y2="${yW}" stroke="#111" stroke-width="1.5" />
    <polyline points="${pad + tick},${yW - tick} ${pad},${yW} ${pad + tick},${yW + tick}" fill="none" stroke="#111" stroke-width="1.5" />
    <polyline points="${w - pad - tick},${yW - tick} ${w - pad},${yW} ${w - pad - tick},${yW + tick}" fill="none" stroke="#111" stroke-width="1.5" />
    <rect x="${w / 2 - pillW / 2}" y="${yW - pillH / 2}" width="${pillW}" height="${pillH}" rx="3" fill="#fff" stroke="#111" stroke-width="1" />
    <text x="${w / 2}" y="${yW + 0.5}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="${font}" font-weight="800" fill="#111">${wLabel}</text>
    <!-- 奥行（右） -->
    <line x1="${xL}" y1="${pad}" x2="${xL}" y2="${l - pad}" stroke="#111" stroke-width="1.5" />
    <polyline points="${xL - tick},${pad + tick} ${xL},${pad} ${xL + tick},${pad + tick}" fill="none" stroke="#111" stroke-width="1.5" />
    <polyline points="${xL - tick},${l - pad - tick} ${xL},${l - pad} ${xL + tick},${l - pad - tick}" fill="none" stroke="#111" stroke-width="1.5" />
    <rect x="${xL - pillW / 2}" y="${l / 2 - pillH / 2}" width="${pillW}" height="${pillH}" rx="3" fill="#fff" stroke="#111" stroke-width="1" />
    <text x="${xL}" y="${l / 2 + 0.5}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="${font}" font-weight="800" fill="#111">${lLabel}</text>
  `;
  return svg;
}

function drawDimOverlayOnCanvas(ctx, drawW, drawH) {
  const wLabel = formatMeters(drawW);
  const lLabel = formatMeters(drawH);
  const pad = Math.max(6, Math.min(14, Math.round(Math.min(drawW, drawH) * 0.04)));
  const font = Math.max(10, Math.min(16, Math.round(Math.min(drawW, drawH) * 0.045)));
  const tick = Math.max(4, Math.round(font * 0.45));
  const pillW = Math.max(40, Math.round(font * 3.4));
  const pillH = Math.max(16, Math.round(font * 1.4));
  const labelSpace = Math.max(16, Math.round(font * 1.6));
  const x0 = -drawW / 2;
  const y0 = -drawH / 2;

  ctx.save();
  ctx.strokeStyle = "#111111";
  ctx.fillStyle = "#111111";
  ctx.lineWidth = 1.5;
  ctx.font = `bold ${font}px system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 幅（下・名称ラベルの上）
  const yW = y0 + drawH - pad - labelSpace;
  ctx.beginPath();
  ctx.moveTo(x0 + pad, yW);
  ctx.lineTo(x0 + drawW - pad, yW);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0 + pad + tick, yW - tick);
  ctx.lineTo(x0 + pad, yW);
  ctx.lineTo(x0 + pad + tick, yW + tick);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0 + drawW - pad - tick, yW - tick);
  ctx.lineTo(x0 + drawW - pad, yW);
  ctx.lineTo(x0 + drawW - pad - tick, yW + tick);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111111";
  ctx.beginPath();
  ctx.roundRect(x0 + drawW / 2 - pillW / 2, yW - pillH / 2, pillW, pillH, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#111111";
  ctx.fillText(wLabel, x0 + drawW / 2, yW);

  // 奥行（右）
  const xL = x0 + drawW - pad;
  ctx.strokeStyle = "#111111";
  ctx.beginPath();
  ctx.moveTo(xL, y0 + pad);
  ctx.lineTo(xL, y0 + drawH - pad);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(xL - tick, y0 + pad + tick);
  ctx.lineTo(xL, y0 + pad);
  ctx.lineTo(xL + tick, y0 + pad + tick);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(xL - tick, y0 + drawH - pad - tick);
  ctx.lineTo(xL, y0 + drawH - pad);
  ctx.lineTo(xL + tick, y0 + drawH - pad - tick);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111111";
  ctx.beginPath();
  ctx.roundRect(xL - pillW / 2, y0 + drawH / 2 - pillH / 2, pillW, pillH, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#111111";
  ctx.fillText(lLabel, xL, y0 + drawH / 2);
  ctx.restore();
}

function renderMachines() {
  el.layer.innerHTML = "";
  for (const item of state.items) {
    if (isSheetBackedExtra(item.id) && !findMachine(item.id)) continue;
    const m = findMachine(item.id);
    const size = itemSize(item, m || {});
    const body = size.body || itemBodySize(m, item);
    const node = document.createElement("button");
    node.type = "button";
    const selected = state.selectedUids.has(item.uid);
    node.className =
      "machine" +
      (selected ? " selected" : "") +
      (item.hidden ? " hidden-item" : "") +
      (item.trimmed ? " trimmed" : "") +
      (item.locked ? " locked" : "");
    node.dataset.uid = item.uid;
    if (item.locked) node.dataset.locked = "1";
    node.style.left = `${item.x}px`;
    node.style.top = `${item.y}px`;
    node.style.width = `${item.trimmed ? body.bw : body.mw}px`;
    node.style.height = `${item.trimmed ? body.bh : body.mh}px`;
    node.style.transform = `rotate(${item.rot || 0}deg)`;
    node.style.transformOrigin = "center center";
    if (m && isNewMachine(m)) {
      const newBadge = document.createElement("span");
      newBadge.className = "machine-new-badge";
      newBadge.textContent = "N";
      newBadge.title = "新規マシン";
      node.appendChild(newBadge);
    }
    if (item.locked) {
      const lockBadge = document.createElement("span");
      lockBadge.className = "machine-lock-badge";
      lockBadge.textContent = "鍵";
      lockBadge.title = "クリックでロック解除";
      lockBadge.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setSelectionLocked(false, { itemUids: [item.uid], zoneUids: [] });
      });
      node.appendChild(lockBadge);
    }
    if (m) {
      const drawW = item.trimmed ? body.bw : body.mw;
      const drawH = item.trimmed ? body.bh : body.mh;
      const artUrl = machinePlaceUrl(m);
      const useArt = !!artUrl;
      const label = document.createElement("span");
      label.className = "machine-label";
      label.textContent = m.name;

      if (useArt) {
        // 写真は本体サイズのみ。80cm(4マス)クリアランスは線枠で表現（有酸素と同じ考え方）
        node.classList.add("photo-bg");
        if (!item.trimmed) node.classList.add("with-clearance");

        const img = document.createElement("img");
        img.src = artUrl;
        img.alt = m.name;
        img.draggable = false;
        img.className = "machine-photo";
        img.onerror = () => {
          if (!img.dataset.retry) {
            img.dataset.retry = "1";
            img.src = `${artUrl}${artUrl.includes("?") ? "&" : "?"}r=${Date.now()}`;
            return;
          }
          node.classList.remove("photo-bg", "with-clearance");
          node.classList.add("placeholder-art");
          label.remove();
          img.remove();
          node.querySelector(".machine-body")?.remove();
          node.querySelector(".machine-dims")?.remove();
          node.appendChild(label);
        };

        if (!item.trimmed) {
          const bodyBox = document.createElement("div");
          bodyBox.className = "machine-body";
          bodyBox.style.left = `${body.clear}px`;
          bodyBox.style.top = `${body.clear}px`;
          bodyBox.style.width = `${body.bw}px`;
          bodyBox.style.height = `${body.bh}px`;
          bodyBox.appendChild(img);
          bodyBox.appendChild(buildDimOverlay(body.bw, body.bh));
          bodyBox.appendChild(label);
          node.appendChild(bodyBox);
        } else {
          node.appendChild(img);
          node.appendChild(buildDimOverlay(body.bw, body.bh));
          node.appendChild(label);
        }
      } else {
        node.classList.add("placeholder-art");
        if (!item.trimmed) node.classList.add("with-clearance");
        if (!item.trimmed) {
          const bodyBox = document.createElement("div");
          bodyBox.className = "machine-body";
          bodyBox.style.left = `${body.clear}px`;
          bodyBox.style.top = `${body.clear}px`;
          bodyBox.style.width = `${body.bw}px`;
          bodyBox.style.height = `${body.bh}px`;
          bodyBox.appendChild(buildDimOverlay(body.bw, body.bh));
          bodyBox.appendChild(label);
          node.appendChild(bodyBox);
        } else {
          node.appendChild(buildDimOverlay(drawW, drawH));
          node.appendChild(label);
        }
      }
      node.title = item.locked
        ? `${m.name}（ロック中）`
        : item.trimmed
          ? `${m.name} 本体 ${m.width_cm}×${m.length_cm}cm`
          : `${m.name} 本体 ${m.width_cm}×${m.length_cm}cm + 周囲80cm（線枠）`;
    } else {
      node.textContent = item.id;
      node.title = item.id;
      node.classList.add("placeholder-art");
    }
    node.addEventListener("pointerdown", onMachinePointerDown);
    el.layer.appendChild(node);
  }
  renderMarquee();
  updateChrome();
  renderPalette();
  renderProductLinkChips();
}

function productLinkOf(machine) {
  const link = String(machine?.link || "").trim();
  return /^https?:\/\//i.test(link) ? link : "";
}

function renderProductLinkChips() {
  el.layer.querySelectorAll(".product-link-chip").forEach((n) => n.remove());
  const sels = selectedItems().filter((i) => !i.hidden);
  if (sels.length !== 1) return;
  const item = sels[0];
  const m = findMachine(item.id);
  const url = productLinkOf(m);
  if (!url) return;
  const { bw } = itemSize(item, m || {});
  const chip = document.createElement("a");
  chip.className = "product-link-chip";
  chip.href = url;
  chip.target = "_blank";
  chip.rel = "noopener noreferrer";
  chip.textContent = "商品詳細";
  chip.title = url;
  chip.style.left = `${item.x + bw / 2}px`;
  chip.style.top = `${Math.max(0, item.y - 6)}px`;
  chip.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  el.layer.appendChild(chip);
}

function zoneLabelText() {
  return (el.zoneLabel?.value || "").trim().slice(0, 40);
}

function freeTextValue() {
  return (el.zoneFreetext?.value || "").trim().slice(0, 80);
}

function setZoneTool(tool) {
  state.zoneTool = tool === "rect" ? "rect" : null;
  state.zoneDraft = null;
  if (tool) state.zoneEditUid = null;
  el.btnZoneRect?.classList.toggle("active", state.zoneTool === "rect");
  el.btnZoneOff?.classList.toggle("active", !state.zoneTool);
  el.viewport?.classList.toggle("zone-draw", !!state.zoneTool);
  renderZones();
}

function clearZoneEdit() {
  state.zoneEditUid = null;
  state.zoneResize = null;
  state.zoneLabelDrag = null;
  state.zoneMove = null;
}

function zoneBounds(z) {
  if (z.type === "text") {
    const len = Math.max(1, String(z.label || "").length);
    const long = Math.min(420, 24 + len * 16);
    const short = z.vertical ? Math.min(80, 28 + len * 2) : 44;
    const w = z.vertical ? short : long;
    const h = z.vertical ? long : short;
    const dx = Number(z.labelDx) || 0;
    const dy = Number(z.labelDy) || 0;
    return { x: z.x + dx - w / 2, y: z.y + dy - h / 2, w, h };
  }
  if (z.type === "circle") {
    return { x: z.cx - z.r, y: z.cy - z.r, w: z.r * 2, h: z.r * 2 };
  }
  return { x: z.x, y: z.y, w: z.w, h: z.h };
}

function applyZoneResize(z, handle, plan, orig) {
  const MIN = 24;
  if (z.type === "circle") {
    const r = Math.max(MIN / 2, Math.hypot(plan.x - orig.cx, plan.y - orig.cy));
    z.cx = orig.cx;
    z.cy = orig.cy;
    z.r = r;
    return;
  }
  let { x, y, w, h } = orig;
  const right = x + w;
  const bottom = y + h;
  if (handle.includes("w")) {
    const nx = Math.min(plan.x, right - MIN);
    w = right - nx;
    x = nx;
  }
  if (handle.includes("e")) {
    w = Math.max(MIN, plan.x - x);
  }
  if (handle.includes("n")) {
    const ny = Math.min(plan.y, bottom - MIN);
    h = bottom - ny;
    y = ny;
  }
  if (handle.includes("s")) {
    h = Math.max(MIN, plan.y - y);
  }
  z.x = x;
  z.y = y;
  z.w = w;
  z.h = h;
}

function initZoneColors() {
  if (!el.zoneColors) return;
  el.zoneColors.innerHTML = ZONE_COLORS.map(
    (c) =>
      `<button type="button" class="zone-swatch${c.fill === state.zoneColor ? " active" : ""}" data-fill="${c.fill}" title="${c.name}" style="background:${c.chip}"></button>`
  ).join("");
  el.zoneColors.addEventListener("click", (e) => {
    const btn = e.target.closest(".zone-swatch");
    if (!btn) return;
    state.zoneColor = btn.dataset.fill;
    el.zoneColors.querySelectorAll(".zone-swatch").forEach((b) => b.classList.toggle("active", b === btn));
    const sels = [...state.selectedZoneUids];
    if (sels.length) {
      pushUndo();
      for (const z of state.zones) {
        if (state.selectedZoneUids.has(z.uid) && z.type !== "text") z.color = state.zoneColor;
      }
      renderZones();
      markDirty();
    }
  });
}

function renderZoneNode(z, { draft = false } = {}) {
  const editing = !draft && state.zoneEditUid === z.uid && !z.locked;
  const selected = !draft && state.selectedZoneUids.has(z.uid);
  const node = document.createElement("div");
  node.className = `zone-shape ${z.type}${draft ? " draft" : ""}${selected ? " selected" : ""}${
    editing ? " is-editing" : ""
  }${z.locked ? " locked" : ""}`;
  if (z.type === "text") {
    node.style.left = `${z.x}px`;
    node.style.top = `${z.y}px`;
  } else {
    node.style.background = z.color || state.zoneColor;
    if (z.type === "circle") {
      const d = Math.max(8, z.r * 2);
      node.style.left = `${z.cx - z.r}px`;
      node.style.top = `${z.cy - z.r}px`;
      node.style.width = `${d}px`;
      node.style.height = `${d}px`;
    } else {
      node.style.left = `${z.x}px`;
      node.style.top = `${z.y}px`;
      node.style.width = `${z.w}px`;
      node.style.height = `${z.h}px`;
    }
  }

  if (z.label || z.type === "text") {
    const label = document.createElement("div");
    label.className = `zone-label-text${z.vertical ? " is-vertical" : ""}`;
    label.textContent = z.label || "";
    const dx = Number(z.labelDx) || 0;
    const dy = Number(z.labelDy) || 0;
    const sx = z.flipX ? -1 : 1;
    const sy = z.flipY ? -1 : 1;
    label.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${sx}, ${sy})`;
    if (!draft) {
      if (z.type === "text") {
        label.dataset.uid = z.uid;
        label.addEventListener("pointerdown", onZonePointerDown);
      } else {
        label.addEventListener("pointerdown", (e) => onZoneLabelPointerDown(e, z.uid));
      }
    }
    node.appendChild(label);
  }

  if (!draft && z.locked) {
    const badge = document.createElement("span");
    badge.className = "zone-lock-badge";
    badge.textContent = "鍵";
    badge.title = "クリックでロック解除";
    badge.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      setSelectionLocked(false, { itemUids: [], zoneUids: [z.uid] });
    });
    node.appendChild(badge);
  }

  if (!draft) {
    node.dataset.uid = z.uid;
    if (z.locked) node.dataset.locked = "1";
    node.title = z.locked
      ? `${z.label || "区画"}（ロック中）`
      : z.type === "text"
        ? "ドラッグで移動 / Deleteで削除"
        : editing
          ? "ハンドルでサイズ調整 / 文字をドラッグで移動"
          : "クリックで選択 / ダブルクリックでサイズ調整";
    if (z.type !== "text") node.addEventListener("pointerdown", onZonePointerDown);
    if (editing && z.type !== "text") {
      const handles = z.type === "circle" ? ["n", "e", "s", "w"] : ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
      for (const h of handles) {
        const handle = document.createElement("div");
        handle.className = `zone-handle ${h}`;
        handle.dataset.handle = h;
        handle.addEventListener("pointerdown", (e) => onZoneHandlePointerDown(e, z.uid, h));
        node.appendChild(handle);
      }
    }
  }
  return node;
}

function renderZones() {
  if (!el.zonesLayer) return;
  el.zonesLayer.innerHTML = "";
  el.zonesLayer.classList.toggle("is-editing", !!state.zoneEditUid);
  for (const z of state.zones) {
    el.zonesLayer.appendChild(renderZoneNode(z));
  }
  if (state.zoneDraft) {
    el.zonesLayer.appendChild(renderZoneNode(state.zoneDraft, { draft: true }));
  }
}

function selectZone(uidVal, { additive = false } = {}) {
  state.selectedUids = new Set();
  if (additive) {
    if (state.selectedZoneUids.has(uidVal)) state.selectedZoneUids.delete(uidVal);
    else state.selectedZoneUids.add(uidVal);
  } else {
    state.selectedZoneUids = new Set([uidVal]);
  }
  if (!state.selectedZoneUids.has(state.zoneEditUid) && state.zoneEditUid) clearZoneEdit();
  const z = state.zones.find((x) => x.uid === uidVal);
  if (z && state.selectedZoneUids.size === 1) {
    if (z.type === "text") {
      if (el.zoneFreetext) el.zoneFreetext.value = z.label || "";
    } else if (el.zoneLabel) {
      el.zoneLabel.value = z.label || "";
    }
  }
}

function onZonePointerDown(e) {
  if (state.zoneTool) return;
  const uidVal = e.currentTarget.dataset.uid;
  const z0 = state.zones.find((x) => x.uid === uidVal);
  if (e.target.closest(".zone-handle")) return;
  // 色付きゾーンのラベルは別ハンドラ。文字ゾーンはラベル自体を掴む
  if (e.target.closest(".zone-label-text") && z0?.type !== "text") return;
  if (e.target.closest(".zone-lock-badge")) return;
  e.preventDefault();
  e.stopPropagation();
  selectZone(uidVal, { additive: e.shiftKey || e.ctrlKey || e.metaKey });
  // ロック中は選択のみ（移動・変形しない）
  if (z0?.locked) {
    clearZoneEdit();
    flash("ロック中");
    renderZones();
    renderMachines();
    updateChrome();
    return;
  }
  // シングル選択ならすぐ編集ハンドル＋移動できるようにする
  if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
    state.zoneEditUid = uidVal;
  }
  const z = state.zones.find((x) => x.uid === uidVal);
  const plan = clientToPlan(e.clientX, e.clientY);
  state.zonePointerMoved = false;
  state.zoneTapCandidate = uidVal;
  if (z) {
    state.zoneMove = {
      uid: uidVal,
      start: plan,
      orig:
        z.type === "circle"
          ? { cx: z.cx, cy: z.cy, r: z.r }
          : z.type === "text"
            ? { x: z.x, y: z.y }
            : { x: z.x, y: z.y, w: z.w, h: z.h },
      undid: false,
    };
  }
  renderZones();
  renderMachines();
  updateChrome();
  e.currentTarget.setPointerCapture?.(e.pointerId);
}

function onZoneHandlePointerDown(e, uidVal, handle) {
  e.preventDefault();
  e.stopPropagation();
  const z = state.zones.find((x) => x.uid === uidVal);
  if (!z) return;
  if (z.locked) {
    flash("ロック中");
    return;
  }
  pushUndo();
  const plan = clientToPlan(e.clientX, e.clientY);
  state.zoneTapCandidate = null;
  state.zoneResize = {
    uid: uidVal,
    handle,
    start: plan,
    orig:
      z.type === "circle"
        ? { cx: z.cx, cy: z.cy, r: z.r }
        : { x: z.x, y: z.y, w: z.w, h: z.h },
  };
  e.currentTarget.setPointerCapture?.(e.pointerId);
}

function onZoneLabelPointerDown(e, uidVal) {
  if (state.zoneTool) return;
  e.preventDefault();
  e.stopPropagation();
  selectZone(uidVal);
  const z = state.zones.find((x) => x.uid === uidVal);
  if (!z) return;
  if (z.locked) {
    clearZoneEdit();
    flash("ロック中");
    renderZones();
    renderMachines();
    updateChrome();
    return;
  }
  const plan = clientToPlan(e.clientX, e.clientY);
  state.zoneLabelDrag = {
    uid: uidVal,
    start: plan,
    origDx: Number(z.labelDx) || 0,
    origDy: Number(z.labelDy) || 0,
    undid: false,
  };
  state.zonePointerMoved = false;
  state.zoneTapCandidate = uidVal;
  e.currentTarget.setPointerCapture?.(e.pointerId);
  renderZones();
  renderMachines();
  updateChrome();
}

function enterZoneEdit(uidVal) {
  const z0 = state.zones.find((x) => x.uid === uidVal);
  if (z0?.locked) {
    flash("ロック中");
    selectZone(uidVal);
    renderZones();
    updateChrome();
    return;
  }
  state.zoneEditUid = uidVal;
  state.selectedZoneUids = new Set([uidVal]);
  state.selectedUids = new Set();
  const z = state.zones.find((x) => x.uid === uidVal);
  if (z) {
    if (z.type === "text") {
      if (el.zoneFreetext) el.zoneFreetext.value = z.label || "";
    } else if (el.zoneLabel) {
      el.zoneLabel.value = z.label || "";
    }
  }
  setZoneTool(null);
  renderZones();
  renderMachines();
  updateChrome();
  flash(z?.type === "text" ? "文字選択中（ドラッグで移動）" : "サイズ調整モード（ハンドルをドラッグ）");
}

function finalizeZoneDraft() {
  const d = state.zoneDraft;
  state.zoneDraft = null;
  if (!d) return;
  if (d.type === "circle") {
    if (!Number.isFinite(d.r) || d.r < 12) {
      renderZones();
      return;
    }
  } else if (!Number.isFinite(d.w) || !Number.isFinite(d.h) || d.w < 12 || d.h < 12) {
    renderZones();
    return;
  }
  pushUndo();
  const zone =
    d.type === "circle"
      ? {
          uid: uid(),
          type: "circle",
          label: zoneLabelText(),
          color: d.color,
          cx: d.cx,
          cy: d.cy,
          r: d.r,
          labelDx: 0,
          labelDy: 0,
          flipX: false,
          flipY: false,
          vertical: false,
          locked: false,
        }
      : {
          uid: uid(),
          type: "rect",
          label: zoneLabelText(),
          color: d.color,
          x: d.x,
          y: d.y,
          w: d.w,
          h: d.h,
          labelDx: 0,
          labelDy: 0,
          flipX: false,
          flipY: false,
          vertical: false,
          locked: false,
        };
  state.zones.push(zone);
  state.selectedZoneUids = new Set([zone.uid]);
  state.selectedUids = new Set();
  // 描画後はすぐ選択モードへ（ハンドルでサイズ調整できる）
  setZoneTool(null);
  state.zoneEditUid = zone.uid;
  renderZones();
  renderMachines();
  updateChrome();
  markDirty();
  flash(zone.label ? `ゾーン追加: ${zone.label}` : "ゾーン追加（ドラッグで調整）");
}

function applyZoneLabelFromInput() {
  const label = zoneLabelText();
  if (!state.selectedZoneUids.size) return;
  const targets = state.zones.filter(
    (z) => state.selectedZoneUids.has(z.uid) && z.type !== "text" && !z.locked
  );
  if (!targets.length) {
    if (selectedZones().some((z) => z.locked)) flash("ロック中");
    return;
  }
  pushUndo();
  for (const z of targets) z.label = label;
  renderZones();
  markDirty();
}

function applyFreeTextFromInput() {
  const label = freeTextValue();
  const texts = state.zones.filter((z) => state.selectedZoneUids.has(z.uid) && z.type === "text");
  if (!texts.length) return;
  if (!label) {
    flash("文字が空です");
    return;
  }
  pushUndo();
  for (const z of texts) z.label = label;
  renderZones();
  updateChrome();
  markDirty();
}

function placeFreeTextAt(plan) {
  const label = freeTextValue();
  if (!label) {
    el.zoneFreetext?.focus();
    flash("文字を入力してからダブルクリック");
    return;
  }
  pushUndo();
  setZoneTool(null);
  const zone = {
    uid: crypto.randomUUID(),
    type: "text",
    label,
    color: "transparent",
    x: plan.x,
    y: plan.y,
    labelDx: 0,
    labelDy: 0,
    flipX: false,
    flipY: false,
    vertical: false,
    locked: false,
  };
  state.zones.push(zone);
  state.selectedUids = new Set();
  state.selectedZoneUids = new Set([zone.uid]);
  state.zoneEditUid = zone.uid;
  renderZones();
  renderMachines();
  updateChrome();
  markDirty();
  flash(`文字配置: ${label}`);
}

function toggleSelectedZonesVertical() {
  if (!state.selectedZoneUids.size) return;
  const targets = state.zones.filter((z) => state.selectedZoneUids.has(z.uid) && !z.locked);
  if (!targets.length) {
    flash("ロック中");
    return;
  }
  pushUndo();
  for (const z of targets) z.vertical = !z.vertical;
  renderZones();
  updateChrome();
  markDirty();
}

function flipSelectedZones(axis) {
  if (!state.selectedZoneUids.size) return;
  const targets = state.zones.filter((z) => state.selectedZoneUids.has(z.uid) && !z.locked);
  if (!targets.length) {
    flash("ロック中");
    return;
  }
  pushUndo();
  for (const z of targets) {
    if (axis === "x") z.flipX = !z.flipX;
    if (axis === "y") z.flipY = !z.flipY;
  }
  renderZones();
  updateChrome();
  markDirty();
}

function renderMarquee() {
  let box = el.stage.querySelector(".marquee");
  if (!state.marquee) {
    if (box) box.remove();
    return;
  }
  const { x0, y0, x1, y1 } = state.marquee;
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const width = Math.abs(x1 - x0);
  const height = Math.abs(y1 - y0);
  if (!box) {
    box = document.createElement("div");
    box.className = "marquee";
    el.stage.appendChild(box);
  }
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
}

function setSelection(uids, { additive = false } = {}) {
  if (!additive) state.selectedUids = new Set(uids);
  else uids.forEach((u) => state.selectedUids.add(u));
}

function toggleSelection(uidVal) {
  if (state.selectedUids.has(uidVal)) state.selectedUids.delete(uidVal);
  else state.selectedUids.add(uidVal);
}

function selectedItems() {
  return state.items.filter((i) => state.selectedUids.has(i.uid));
}

function updateChrome() {
  const n = state.items.filter((i) => itemOnFloor(i)).length;
  const zc = state.zones.length;
  el.statusCount.textContent = zc ? `${n}台 / ゾーン${zc}` : `${n}`;
  const sels = selectedItems();
  const zsels = state.zones.filter((z) => state.selectedZoneUids.has(z.uid));
  if (sels.length === 1) {
    const m = findMachine(sels[0].id);
    el.statusSel.textContent = m ? m.name : "";
    const url = productLinkOf(m);
    if (el.statusLink) {
      if (url) {
        el.statusLink.hidden = false;
        el.statusLink.href = url;
        el.statusLink.textContent = "商品URL";
      } else {
        el.statusLink.hidden = true;
        el.statusLink.removeAttribute("href");
        el.statusLink.textContent = "";
      }
    }
  } else if (sels.length > 1) {
    el.statusSel.textContent = `${sels.length}台`;
    if (el.statusLink) {
      el.statusLink.hidden = true;
      el.statusLink.removeAttribute("href");
    }
  } else if (zsels.length === 1) {
    const z = zsels[0];
    el.statusSel.textContent =
      z.type === "text"
        ? z.label
          ? `文字: ${z.label}`
          : "文字選択中"
        : z.label
          ? `ゾーン: ${z.label}`
          : "ゾーン選択中";
    if (el.statusLink) {
      el.statusLink.hidden = true;
      el.statusLink.removeAttribute("href");
    }
  } else if (zsels.length > 1) {
    el.statusSel.textContent = `ゾーン ${zsels.length}`;
    if (el.statusLink) {
      el.statusLink.hidden = true;
      el.statusLink.removeAttribute("href");
    }
  } else if (state.updatedAt) {
    const t = new Date(state.updatedAt);
    const stamp = Number.isNaN(t.getTime())
      ? state.updatedAt
      : t.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    el.statusSel.textContent = `${state.updatedBy || "?"} ${stamp}`;
    if (el.statusLink) {
      el.statusLink.hidden = true;
      el.statusLink.removeAttribute("href");
    }
  } else {
    el.statusSel.textContent = "";
    if (el.statusLink) {
      el.statusLink.hidden = true;
      el.statusLink.removeAttribute("href");
    }
  }
  const has = sels.length > 0;
  const hasZone = zsels.length > 0;
  const lockTargets = [...sels, ...zsels];
  const hasLockTarget = lockTargets.length > 0;
  const allLocked = hasLockTarget && lockTargets.every((it) => it.locked);
  const hasUnlockedMachine = sels.some((it) => !it.locked);
  if (el.btnRotate) el.btnRotate.disabled = !hasUnlockedMachine;
  if (el.btnLock) {
    el.btnLock.disabled = !hasLockTarget;
    el.btnLock.textContent = allLocked ? "ロック解除" : "ロック";
    el.btnLock.title = allLocked
      ? "選択中の位置固定を解除"
      : "選択中のマシン／区画を固定（動かない）";
    el.btnLock.classList.toggle("is-locked", allLocked);
  }
  if (el.btnEditMachine) {
    const editId = editableMachineId();
    el.btnEditMachine.disabled = !editId;
    el.btnEditMachine.title = editId
      ? `「${findMachine(editId)?.name || editId}」のサイズ・内容を変更（配置は維持）`
      : "マシンを1台選択（またはパレットをクリック）して変更";
  }
  if (el.btnZoneVertical) {
    el.btnZoneVertical.disabled = !hasZone || zsels.every((z) => z.locked);
  }
  if (el.btnZoneFlipX) {
    el.btnZoneFlipX.disabled = !hasZone || zsels.every((z) => z.locked);
  }
  if (el.btnZoneFlipY) {
    el.btnZoneFlipY.disabled = !hasZone || zsels.every((z) => z.locked);
  }
  if (el.statusRoom) el.statusRoom.textContent = state.roomId;
  renderProductLinkChips();
}

function renderHistory() {
  // 履歴UIは非表示。状態だけ保持（手動保存のスナップショット復元用に内部保持）
  if (!el.history) return;
  el.history.innerHTML = '<option value="">履歴</option>';
}

function toggleLockSelected() {
  const sels = selectedItems();
  const zsels = state.zones.filter((z) => state.selectedZoneUids.has(z.uid));
  if (!sels.length && !zsels.length) {
    flash("選択なし");
    return;
  }
  const unlock = [...sels, ...zsels].every((it) => it.locked);
  setSelectionLocked(!unlock);
}

function selectedZones() {
  return state.zones.filter((z) => state.selectedZoneUids.has(z.uid));
}

function setZonesLockedSafe(uids, locked) {
  const idSet = new Set(uids);
  const targets = state.zones.filter((z) => idSet.has(z.uid) && !!z.locked !== !!locked);
  if (!targets.length) return false;
  for (const z of targets) z.locked = !!locked;
  if (locked) {
    for (const z of targets) {
      if (state.zoneEditUid === z.uid) clearZoneEdit();
    }
  }
  return true;
}

function setItemsLockedSafe(uids, locked) {
  const idSet = new Set(uids);
  const targets = state.items.filter((it) => idSet.has(it.uid) && !!it.locked !== !!locked);
  if (!targets.length) return false;
  for (const item of targets) item.locked = !!locked;
  return true;
}

function setSelectionLocked(locked, { itemUids = null, zoneUids = null } = {}) {
  const iUids = itemUids || selectedItems().map((i) => i.uid);
  const zUids = zoneUids || selectedZones().map((z) => z.uid);
  const willChange =
    state.items.some((it) => iUids.includes(it.uid) && !!it.locked !== !!locked) ||
    state.zones.some((z) => zUids.includes(z.uid) && !!z.locked !== !!locked);
  if (!willChange) return;
  pushUndo();
  const itemChanged = setItemsLockedSafe(iUids, locked);
  const zoneChanged = setZonesLockedSafe(zUids, locked);
  if (!itemChanged && !zoneChanged) {
    state.undoStack.pop();
    return;
  }
  renderZones();
  renderMachines();
  updateChrome();
  markDirty({ immediate: true });
  flash(locked ? "ロック" : "ロック解除");
}

function roomContentCount(data) {
  const items = Array.isArray(data?.items) ? data.items.length : 0;
  const zones = Array.isArray(data?.zones) ? data.zones.length : 0;
  return items + zones;
}

function rememberLastGood(data, roomId = state.roomId) {
  if (!data || roomContentCount(data) <= 0) return;
  try {
    const payload = {
      roomId,
      updatedAt: data.updatedAt || new Date().toISOString(),
      updatedBy: data.updatedBy || authorName(),
      items: Array.isArray(data.items) ? data.items : [],
      zones: Array.isArray(data.zones) ? data.zones : [],
      savedAt: Date.now(),
    };
    localStorage.setItem(`${LAST_GOOD_KEY}:${roomId}`, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

function readLastGood(roomId = state.roomId) {
  try {
    const raw = localStorage.getItem(`${LAST_GOOD_KEY}:${roomId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isNewerLayout(a, b) {
  if (!a) return false;
  if (!b) return true;
  const at = String(a.updatedAt || "");
  const bt = String(b.updatedAt || "");
  if (at && bt && at !== bt) return at > bt;
  return roomContentCount(a) > roomContentCount(b);
}

function pickRichestLayout(candidates) {
  let best = null;
  for (const c of candidates) {
    if (!c) continue;
    if (!best || isNewerLayout(c, best) || (roomContentCount(c) > roomContentCount(best) && !isNewerLayout(best, c))) {
      best = c;
    }
  }
  return best;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchRoom() {
  const url = `/api/room?id=${encodeURIComponent(state.roomId)}&t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    const err = new Error(json.error || "load failed");
    err.code = json.error;
    err.messageJa = json.message || "";
    throw err;
  }
  return json.data;
}

async function fetchRoomLatest() {
  const local = readLastGood();
  let best = null;
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const data = await fetchRoom();
      best = pickRichestLayout([best, data]);
      // Blob遅延で古い空/欠けが来る場合は短い間隔で取り直す
      const localRicher =
        local &&
        roomContentCount(local) > roomContentCount(data) &&
        (!data?.updatedAt || !local.updatedAt || String(local.updatedAt) >= String(data.updatedAt));
      if (!localRicher && roomContentCount(data) > 0) break;
      if (i < 2) await sleep(400);
    } catch (err) {
      lastErr = err;
      if (i < 2) await sleep(400);
    }
  }
  if (!best) {
    if (local && roomContentCount(local) > 0) return { ...local, _fromLocal: true };
    if (lastErr) throw lastErr;
    return emptyFallbackRoom();
  }
  const chosen = pickRichestLayout([best, local]);
  if (chosen === local && local && roomContentCount(local) > roomContentCount(best)) {
    return { ...local, history: best.history, _fromLocal: true };
  }
  return chosen;
}

function emptyFallbackRoom() {
  return {
    roomId: state.roomId,
    updatedAt: null,
    updatedBy: null,
    items: [],
    zones: [],
    history: [],
  };
}

function applyRoomData(data, { keepSelection = false } = {}) {
  const rawItems = Array.isArray(data.items) ? data.items : [];
  state.items = rawItems
    .map((it) => ({
      ...it,
      // 旧「両用」ID → アブダクション側へ移行
      id: it.id === "resistance_10_11" ? "resistance_10" : it.id,
    }))
    .filter(inPlanBounds);
  state.zones = Array.isArray(data.zones) ? data.zones.map((z) => ({ ...z })) : [];
  state.history = Array.isArray(data.history) ? data.history : state.history || [];
  state.updatedAt = data.updatedAt || null;
  state.updatedBy = data.updatedBy || null;
  rememberLastGood({
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
    items: state.items,
    zones: state.zones,
  });
  if (!keepSelection) {
    state.selectedUids = new Set();
    state.selectedZoneUids = new Set();
    clearZoneEdit();
  }
  renderHistory();
  renderZones();
  renderMachines();
  state.lastSavedFp = contentFingerprint();
  state.dirty = false;
  state.needsResave = false;
  state.saveRetryCount = 0;
  state.conflictPending = false;
  state.conflictServerData = null;
  state.saveStatus = "saved";
  hideConflictModal();
  updateDirtyUi();
}

async function loadCloud(showFlash = true) {
  if (showFlash) flash("読込中…");
  if (state.autosaveTimer) {
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = null;
  }
  try {
    const data = await fetchRoomLatest();
    applyRoomData(data);
    await refreshPeerCounts();
    renderPalette();
    if (data._fromLocal) {
      flash("最新（この端末の保存）");
      showSaveToast("サーバが追いつく前なので、この端末の最新配置を表示しました");
      markDirty({ immediate: true });
    } else if (showFlash) {
      flash(data.updatedAt ? "最新を表示" : "まだ空です");
    }
  } catch (err) {
    console.error(err);
    const local = readLastGood();
    if (local && roomContentCount(local) > 0) {
      applyRoomData(local);
      flash("端末の最新を表示");
      showSaveToast("サーバ読込に失敗したため、この端末の最新配置を表示しました", { error: true });
      return;
    }
    if (err?.code === "blob_store_suspended") {
      flash("保存ストレージ停止中");
      showSaveToast(err.messageJa || "Blobストアが停止中です。課金状態を確認してください", { error: true });
    } else {
      flash("読込失敗");
      showSaveToast(err.messageJa || "配置の読込に失敗しました", { error: true });
    }
    throw err;
  }
}

async function saveCloud({ auto = false, force = false } = {}) {
  if (state.conflictPending && !force && auto) {
    updateSaveStatusUi();
    return;
  }
  const snapshot = state.items.map((it) => ({ ...it }));
  const zoneSnap = state.zones.map((z) => ({ ...z }));
  const sentFp = contentFingerprint(snapshot, zoneSnap);
  if (!auto) flash("保存中…");
  state.autosaveInFlight = true;
  state.needsResave = false;
  state.saveStatus = "saving";
  el.btnSave?.classList.add("is-saving");
  if (el.btnSave) el.btnSave.textContent = "保存中…";
  updateSaveStatusUi();
  touchTabLock();
  try {
    const res = await fetch(`/api/room?id=${encodeURIComponent(state.roomId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        by: authorName(),
        items: snapshot,
        zones: zoneSnap,
        auto: !!auto,
        force: !!force,
        note: auto ? "自動保存" : force ? "強制保存" : undefined,
        baseUpdatedAt: state.updatedAt || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));

    if (res.status === 409 && json.error === "version_conflict") {
      if (auto) {
        const handled = await handleAutosaveConflict(json, { sentFp, force });
        if (handled) return;
      }
      openConflictModal(json.data || null);
      showSaveToast("保存が競合しました。どちらを残すか選んでください", { error: true });
      flash("競合");
      return;
    }

    if (!res.ok || !json.ok) throw new Error(json.error || json.message || "save failed");

    // 強制保存などで競合を解消
    state.conflictPending = false;
    state.conflictServerData = null;
    state.saveRetryCount = 0;
    hideConflictModal();

    const savedAt = json.data?.updatedAt || new Date().toISOString();
    const savedBy = json.data?.updatedBy || authorName();
    const localChangedDuringSave = contentFingerprint() !== sentFp;

    // 保存中に追加編集されていたら、レスポンスで巻き戻さない
    if (!localChangedDuringSave) {
      const savedItems = Array.isArray(json.data?.items) ? json.data.items : snapshot;
      const savedZones = Array.isArray(json.data?.zones) ? json.data.zones : zoneSnap;
      state.items = savedItems.map((it) => ({ ...it }));
      state.zones = savedZones.map((z) => ({ ...z }));
      state.dirty = false;
      state.needsResave = false;
      state.lastSavedFp = contentFingerprint();
      state.saveStatus = "saved";
      if (!auto) clearZoneEdit();
    } else {
      // サーバの版番号だけ進め、ローカル編集は残して直後に再保存
      state.dirty = true;
      state.needsResave = true;
      state.lastSavedFp = sentFp;
      state.saveStatus = "dirty";
    }
    state.updatedAt = savedAt;
    state.updatedBy = savedBy;
    rememberLastGood({
      updatedAt: savedAt,
      updatedBy: savedBy,
      items: localChangedDuringSave ? state.items : snapshot,
      zones: localChangedDuringSave ? state.zones : zoneSnap,
    });

    const savedEntry = json.data?.savedEntry;
    if (savedEntry && savedEntry.id) {
      const rest = (state.history || []).filter((h) => h.id !== savedEntry.id);
      state.history = [
        {
          ...savedEntry,
          items: Array.isArray(savedEntry.items) ? savedEntry.items : snapshot,
          zones: Array.isArray(savedEntry.zones) ? savedEntry.zones : zoneSnap,
        },
        ...rest,
      ].slice(0, 40);
    }

    // 履歴メタだけ遅延同期
    const roomAtSave = state.roomId;
    setTimeout(() => {
      if (state.roomId !== roomAtSave) return;
      fetchRoom()
        .then((data) => {
          if (state.roomId !== roomAtSave) return;
          if (Array.isArray(data.history) && data.history.length) {
            state.history = data.history.map((h) => {
              if (Array.isArray(h.items) || Array.isArray(h.zones)) return h;
              const local = (state.history || []).find((x) => x.id === h.id);
              return local
                ? {
                    ...h,
                    items: local.items,
                    zones: local.zones,
                  }
                : h;
            });
          }
          renderHistory();
        })
        .catch(() => {});
    }, 1200);

    renderHistory();
    // 保存中に編集されていたら画面をサーバ応答で塗り直さない
    if (!localChangedDuringSave) {
      renderZones();
      renderMachines();
    }
    await refreshPeerCounts();
    renderPalette();
    updateDirtyUi();
    if (localChangedDuringSave || state.needsResave) {
      flash("続きを保存");
      saveSoon();
    } else {
      showSaveToast(auto ? "自動保存しました" : "保存されました");
      flash(auto ? "自動保存" : "保存済み");
    }
  } catch (err) {
    state.saveStatus = "error";
    throw err;
  } finally {
    state.autosaveInFlight = false;
    el.btnSave?.classList.remove("is-saving");
    updateDirtyUi();
    // 保存完了後に溜まっていた編集があればすぐ送る
    if (
      !state.conflictPending &&
      (state.needsResave || (state.dirty && contentFingerprint() !== state.lastSavedFp))
    ) {
      saveSoon();
    }
  }
}

function openConflictModal(serverData) {
  state.conflictPending = true;
  state.conflictServerData = serverData || null;
  state.saveStatus = "conflict";
  if (el.conflictModal) el.conflictModal.hidden = false;
  updateSaveStatusUi();
}

function hideConflictModal() {
  if (el.conflictModal) el.conflictModal.hidden = true;
}

async function resolveConflictKeepMine() {
  hideConflictModal();
  state.conflictPending = false;
  state.conflictServerData = null;
  try {
    await enqueueSave({ auto: false, force: true });
  } catch (err) {
    console.error(err);
    state.saveStatus = "error";
    updateDirtyUi();
    showSaveToast("上書き保存に失敗しました", { error: true });
  }
}

async function resolveConflictTakeServer() {
  const data = state.conflictServerData;
  hideConflictModal();
  state.conflictPending = false;
  state.conflictServerData = null;
  if (data) applyRoomData(data);
  else {
    try {
      await loadCloud(false);
    } catch (err) {
      console.error(err);
    }
  }
  await refreshPeerCounts();
  renderPalette();
  state.saveStatus = "saved";
  updateDirtyUi();
  showSaveToast("サーバ版を読み込みました");
  flash("サーバ版");
}

function resolveConflictLater() {
  hideConflictModal();
  // conflictPending は残し、勝手に上書きしない
  state.saveStatus = "conflict";
  state.dirty = true;
  updateDirtyUi();
  showSaveToast("競合を保留しました。保存ボタンから選べます", { error: true });
  flash("競合保留");
}

function showSaveToast(message, { error = false } = {}) {
  let toast = document.getElementById("save-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "save-toast";
    toast.className = "save-toast";
    toast.innerHTML = `<span class="save-toast-mark" aria-hidden="true"></span><span class="save-toast-msg"></span>`;
    document.body.appendChild(toast);
  }
  toast.querySelector(".save-toast-msg").textContent = message;
  toast.classList.toggle("is-error", !!error);
  toast.classList.remove("is-out");
  toast.classList.add("is-in");
  clearTimeout(showSaveToast._t);
  showSaveToast._t = setTimeout(() => {
    toast.classList.remove("is-in");
    toast.classList.add("is-out");
  }, 2200);
}

async function copyShare() {
  const url = shareUrl();
  try {
    await navigator.clipboard.writeText(url);
    flash("URLコピー");
  } catch {
    prompt("共有URL", url);
  }
}

function restoreHistory(entryId) {
  if (!entryId) return;
  const entry = (state.history || []).find((h) => h.id === entryId);
  if (!entry || !Array.isArray(entry.items)) {
    flash("履歴なし");
    return;
  }
  state.items = entry.items.map((it) => ({ ...it }));
  state.zones = Array.isArray(entry.zones) ? entry.zones.map((z) => ({ ...z })) : [];
  state.selectedUids = new Set();
  state.selectedZoneUids = new Set();
  renderZones();
  renderMachines();
  markDirty();
  flash("履歴表示");
  el.history.value = "";
}

function clearAll() {
  if (!state.items.length && !state.zones.length) return;
  if (!confirm("全削除？")) return;
  pushUndo();
  state.items = [];
  state.zones = [];
  state.selectedUids = new Set();
  state.selectedZoneUids = new Set();
  clearZoneEdit();
  renderZones();
  renderMachines();
  markDirty();
}

function placeMachine(id, x, y, rot = 0) {
  const m = findMachine(id);
  if (!m) return null;
  if (!canPlaceMore(id)) {
    flash("残0");
    renderPalette();
    return null;
  }
  pushUndo();
  const item = {
    uid: uid(),
    id,
    x,
    y,
    rot,
    hidden: false,
    trimmed: false,
    locked: false,
    place_px_w: m.place_px_w,
    place_px_h: m.place_px_h,
    clearance_cm: m.clearance_cm || DEFAULT_CLEARANCE_CM,
  };
  clampItem(item, m);
  state.items.push(item);
  state.selectedUids = new Set([item.uid]);
  renderMachines();
  markDirty();
  return item;
}

function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function selectByMarquee() {
  if (!state.marquee) return;
  const { x0, y0, x1, y1 } = state.marquee;
  const box = {
    left: Math.min(x0, x1),
    right: Math.max(x0, x1),
    top: Math.min(y0, y1),
    bottom: Math.max(y0, y1),
  };
  const next = [];
  for (const item of state.items) {
    if (item.hidden) continue;
    const m = findMachine(item.id) || {
      place_px_w: item.place_px_w || 200,
      place_px_h: item.place_px_h || 200,
    };
    const e = itemEdges(item, m);
    if (rectsIntersect(box, e)) next.push(item.uid);
  }
  state.selectedUids = new Set(next);
}

function onMachinePointerDown(e) {
  if (state.spaceDown || e.button === 1) return;
  if (e.button === 2) return; // 右クリックは contextmenu で処理
  e.preventDefault();
  e.stopPropagation();
  const uidVal = e.currentTarget.dataset.uid;
  const targetItem = state.items.find((i) => i.uid === uidVal);
  const additive = e.ctrlKey || e.metaKey || e.shiftKey;
  let selectionChanged = false;
  if (additive) {
    toggleSelection(uidVal);
    selectionChanged = true;
  } else if (!state.selectedUids.has(uidVal)) {
    state.selectedUids = new Set([uidVal]);
    state.selectedZoneUids = new Set();
    selectionChanged = true;
  } else if (state.selectedZoneUids.size) {
    state.selectedZoneUids = new Set();
    selectionChanged = true;
  }
  // 選択が変わったときだけ再描画（毎回作り直すと dblclick が死ぬ）
  if (selectionChanged) renderMachines();
  else updateChrome();

  // ロック中は選択のみ（位置を動かさない）
  if (targetItem?.locked) {
    flash("ロック中");
    return;
  }
  // 選択にロック機が混ざっている場合はドラッグ開始しない
  if (selectedItems().some((it) => it.locked)) {
    flash("ロック機を含むため移動不可");
    return;
  }

  pushUndo();
  state.dragMoved = false;
  const plan = clientToPlan(e.clientX, e.clientY);
  state.dragPrimaryUid = uidVal;
  state.dragStartPlan = plan;
  state.dragOrigins = new Map();
  for (const item of selectedItems()) {
    state.dragOrigins.set(item.uid, { x: item.x, y: item.y });
  }
  const node = el.layer.querySelector(`[data-uid="${uidVal}"]`) || e.currentTarget;
  node.setPointerCapture?.(e.pointerId);
}

function onViewportPointerDown(e) {
  if (e.target.closest(".machine")) return;
  if (e.target.closest(".zone-handle") || e.target.closest(".zone-label-text")) return;
  if (e.target.closest(".zone-shape") && !state.zoneTool) return;

  // ゾーン描画モード: ドラッグで四角／丸
  if (state.zoneTool && e.button === 0 && !state.spaceDown) {
    e.preventDefault();
    const plan = clientToPlan(e.clientX, e.clientY);
    state.selectedUids = new Set();
    state.selectedZoneUids = new Set();
    clearZoneEdit();
    state.zoneDraft = {
      type: state.zoneTool,
      color: state.zoneColor,
      label: zoneLabelText(),
      x0: plan.x,
      y0: plan.y,
      x: plan.x,
      y: plan.y,
      w: 0,
      h: 0,
      cx: plan.x,
      cy: plan.y,
      r: 0,
    };
    renderZones();
    renderMachines();
    el.viewport.setPointerCapture(e.pointerId);
    return;
  }

  if (e.button === 1 || e.button === 2 || state.spaceDown || (e.button === 0 && !(e.ctrlKey || e.metaKey))) {
    // 通常の空き地 = パン＋選択解除
    state.selectedUids = new Set();
    state.selectedZoneUids = new Set();
    clearZoneEdit();
    renderZones();
    renderMachines();
    state.panning = true;
    state.panStart = { x: e.clientX, y: e.clientY, ox: state.view.ox, oy: state.view.oy };
    el.viewport.classList.add("panning");
    el.viewport.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;
  // Ctrl/⌘ + 空き地ドラッグ = 枠選択
  const plan = clientToPlan(e.clientX, e.clientY);
  if (!(e.shiftKey)) {
    state.selectedUids = new Set();
    state.selectedZoneUids = new Set();
    clearZoneEdit();
  }
  state.marquee = { x0: plan.x, y0: plan.y, x1: plan.x, y1: plan.y };
  el.viewport.classList.add("selecting");
  renderZones();
  renderMachines();
  el.viewport.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (state.zoneResize) {
    const z = state.zones.find((x) => x.uid === state.zoneResize.uid);
    if (!z) return;
    const plan = clientToPlan(e.clientX, e.clientY);
    applyZoneResize(z, state.zoneResize.handle, plan, state.zoneResize.orig);
    state.zonePointerMoved = true;
    renderZones();
    return;
  }
  if (state.zoneMove) {
    const z = state.zones.find((x) => x.uid === state.zoneMove.uid);
    if (!z) return;
    const plan = clientToPlan(e.clientX, e.clientY);
    const dx = plan.x - state.zoneMove.start.x;
    const dy = plan.y - state.zoneMove.start.y;
    if (Math.hypot(dx, dy) > 1) {
      if (!state.zoneMove.undid) {
        pushUndo();
        state.zoneMove.undid = true;
      }
      state.zonePointerMoved = true;
    }
    const o = state.zoneMove.orig;
    if (z.type === "circle") {
      z.cx = o.cx + dx;
      z.cy = o.cy + dy;
    } else {
      z.x = o.x + dx;
      z.y = o.y + dy;
    }
    renderZones();
    return;
  }
  if (state.zoneLabelDrag) {
    const z = state.zones.find((x) => x.uid === state.zoneLabelDrag.uid);
    if (!z) return;
    const plan = clientToPlan(e.clientX, e.clientY);
    const dx = plan.x - state.zoneLabelDrag.start.x;
    const dy = plan.y - state.zoneLabelDrag.start.y;
    if (Math.hypot(dx, dy) > 1) {
      if (!state.zoneLabelDrag.undid) {
        pushUndo();
        state.zoneLabelDrag.undid = true;
      }
      state.zonePointerMoved = true;
    }
    z.labelDx = state.zoneLabelDrag.origDx + dx;
    z.labelDy = state.zoneLabelDrag.origDy + dy;
    renderZones();
    return;
  }
  if (state.zoneDraft) {
    const plan = clientToPlan(e.clientX, e.clientY);
    const d = state.zoneDraft;
    if (d.type === "circle") {
      d.cx = d.x0;
      d.cy = d.y0;
      d.r = Math.hypot(plan.x - d.x0, plan.y - d.y0);
    } else {
      d.x = Math.min(d.x0, plan.x);
      d.y = Math.min(d.y0, plan.y);
      d.w = Math.abs(plan.x - d.x0);
      d.h = Math.abs(plan.y - d.y0);
    }
    renderZones();
    return;
  }
  if (state.dragPrimaryUid && state.dragOrigins) {
    const primary = state.items.find((i) => i.uid === state.dragPrimaryUid);
    const pm = primary && findMachine(primary.id);
    if (!primary || !pm) return;
    const plan = clientToPlan(e.clientX, e.clientY);
    const origin = state.dragOrigins.get(primary.uid);
    let dx = plan.x - state.dragStartPlan.x;
    let dy = plan.y - state.dragStartPlan.y;
    primary.x = origin.x + dx;
    primary.y = origin.y + dy;
    if (!e.shiftKey) snapPosition(primary, pm);
    else clearGuides();
    clampItem(primary, pm);
    dx = primary.x - origin.x;
    dy = primary.y - origin.y;
    if (Math.hypot(dx, dy) > 0.5) state.dragMoved = true;
    for (const [u, o] of state.dragOrigins) {
      if (u === primary.uid) continue;
      const item = state.items.find((i) => i.uid === u);
      const m = item && findMachine(item.id);
      if (!item || !m) continue;
      item.x = o.x + dx;
      item.y = o.y + dy;
      clampItem(item, m);
    }
    for (const item of selectedItems()) {
      const node = el.layer.querySelector(`[data-uid="${item.uid}"]`);
      if (node) {
        node.style.left = `${item.x}px`;
        node.style.top = `${item.y}px`;
      }
    }
    renderProductLinkChips();
    return;
  }
  if (state.marquee) {
    const plan = clientToPlan(e.clientX, e.clientY);
    state.marquee.x1 = plan.x;
    state.marquee.y1 = plan.y;
    renderMarquee();
    return;
  }
  if (state.panning && state.panStart) {
    state.view.ox = state.panStart.ox + (e.clientX - state.panStart.x);
    state.view.oy = state.panStart.oy + (e.clientY - state.panStart.y);
    applyView();
  }
}

function onPointerUp() {
  if (state.zoneDraft) {
    finalizeZoneDraft();
  }
  const wasResizing = !!state.zoneResize;
  const wasMoving = !!state.zoneMove?.undid;
  const labelMoved = !!state.zoneLabelDrag?.undid;
  const dragMoved = !!state.dragMoved;
  if (state.zoneResize) {
    state.zoneResize = null;
    updateChrome();
  }
  if (state.zoneMove) {
    state.zoneMove = null;
  }
  if (state.zoneLabelDrag) {
    const uidVal = state.zoneLabelDrag.uid;
    const moved = state.zonePointerMoved;
    state.zoneLabelDrag = null;
    if (!moved && uidVal) {
      const now = performance.now();
      if (state.lastZoneTap.uid === uidVal && now - state.lastZoneTap.t < 450) {
        state.lastZoneTap = { uid: null, t: 0 };
        enterZoneEdit(uidVal);
      } else {
        state.lastZoneTap = { uid: uidVal, t: now };
      }
    }
  } else if (!wasResizing && !wasMoving && state.zoneTapCandidate && !state.zonePointerMoved) {
    const uidVal = state.zoneTapCandidate;
    const now = performance.now();
    if (state.lastZoneTap.uid === uidVal && now - state.lastZoneTap.t < 450) {
      state.lastZoneTap = { uid: null, t: 0 };
      enterZoneEdit(uidVal);
    } else {
      state.lastZoneTap = { uid: uidVal, t: now };
    }
  }
  state.zoneTapCandidate = null;
  state.zonePointerMoved = false;

  if (state.marquee) {
    const { x0, y0, x1, y1 } = state.marquee;
    const moved = Math.hypot(x1 - x0, y1 - y0) > 4;
    if (moved) selectByMarquee();
    state.marquee = null;
    el.viewport.classList.remove("selecting");
    renderMachines();
  }
  // 動かさず2回タップ = 切取（DOM再生成で native dblclick が死ぬ対策）
  if (state.dragPrimaryUid && !state.dragMoved) {
    state.undoStack.pop();
    const uidVal = state.dragPrimaryUid;
    const now = performance.now();
    if (state.lastTap.uid === uidVal && now - state.lastTap.t < 450) {
      state.lastTap = { uid: null, t: 0 };
      toggleTrim(uidVal);
    } else {
      state.lastTap = { uid: uidVal, t: now };
    }
  } else if (state.dragMoved) {
    state.lastTap = { uid: null, t: 0 };
  }
  state.dragPrimaryUid = null;
  state.dragStartPlan = null;
  state.dragOrigins = null;
  state.dragMoved = false;
  state.panning = false;
  state.panStart = null;
  el.viewport.classList.remove("panning");
  clearGuides();
  if (wasResizing || wasMoving || labelMoved || dragMoved) markDirty({ immediate: true });
}

function onWheel(e) {
  e.preventDefault();
  const rect = el.viewport.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const before = clientToPlan(e.clientX, e.clientY);
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  state.view.scale = Math.min(2.5, Math.max(0.05, state.view.scale * factor));
  // keep cursor point stable
  state.view.ox = mx - before.x * state.view.scale;
  state.view.oy = my - before.y * state.view.scale;
  applyView();
}

function bindDrop() {
  el.viewport.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.viewport.classList.add("drop-target");
  });
  el.viewport.addEventListener("dragleave", () => {
    el.viewport.classList.remove("drop-target");
  });
  el.viewport.addEventListener("drop", (e) => {
    e.preventDefault();
    el.viewport.classList.remove("drop-target");
    const id = e.dataTransfer.getData("text/machine-id");
    const m = findMachine(id);
    if (!m) return;
    const plan = clientToPlan(e.clientX, e.clientY);
    placeMachine(id, plan.x - m.place_px_w / 2, plan.y - m.place_px_h / 2);
  });
}

function hideCtxMenu() {
  document.getElementById("ctx-menu")?.remove();
}

function showMachineCtxMenu(clientX, clientY, uidVal) {
  hideCtxMenu();
  const item = state.items.find((i) => i.uid === uidVal);
  if (!item) return;
  if (!state.selectedUids.has(uidVal)) {
    state.selectedUids = new Set([uidVal]);
    state.selectedZoneUids = new Set();
    renderMachines();
    renderZones();
  }
  const menu = document.createElement("div");
  menu.id = "ctx-menu";
  menu.className = "ctx-menu";
  const btn = document.createElement("button");
  btn.type = "button";
  if (item.locked) {
    btn.textContent = "ロック解除";
    btn.addEventListener("click", () => {
      hideCtxMenu();
      setSelectionLocked(false, { itemUids: [uidVal], zoneUids: [] });
    });
  } else {
    btn.textContent = "位置をロック";
    btn.addEventListener("click", () => {
      hideCtxMenu();
      const uids = selectedItems().length ? selectedItems().map((i) => i.uid) : [uidVal];
      setSelectionLocked(true, { itemUids: uids, zoneUids: [] });
    });
  }
  menu.appendChild(btn);
  document.body.appendChild(menu);
  placeCtxMenu(menu, clientX, clientY);
}

function showZoneCtxMenu(clientX, clientY, uidVal) {
  hideCtxMenu();
  const zone = state.zones.find((z) => z.uid === uidVal);
  if (!zone) return;
  if (!state.selectedZoneUids.has(uidVal)) {
    state.selectedZoneUids = new Set([uidVal]);
    state.selectedUids = new Set();
    clearZoneEdit();
    renderZones();
    renderMachines();
  }
  const menu = document.createElement("div");
  menu.id = "ctx-menu";
  menu.className = "ctx-menu";
  const btn = document.createElement("button");
  btn.type = "button";
  if (zone.locked) {
    btn.textContent = "ロック解除";
    btn.addEventListener("click", () => {
      hideCtxMenu();
      setSelectionLocked(false, { itemUids: [], zoneUids: [uidVal] });
    });
  } else {
    btn.textContent = "区画をロック";
    btn.addEventListener("click", () => {
      hideCtxMenu();
      const uids = selectedZones().length ? selectedZones().map((z) => z.uid) : [uidVal];
      setSelectionLocked(true, { itemUids: [], zoneUids: uids });
    });
  }
  menu.appendChild(btn);
  document.body.appendChild(menu);
  placeCtxMenu(menu, clientX, clientY);
}

function placeCtxMenu(menu, clientX, clientY) {
  const pad = 8;
  const rect = menu.getBoundingClientRect();
  let left = clientX;
  let top = clientY;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
  menu.style.left = `${Math.max(pad, left)}px`;
  menu.style.top = `${Math.max(pad, top)}px`;
}

function onViewportContextMenu(e) {
  e.preventDefault();
  const machine = e.target.closest?.(".machine");
  if (machine?.dataset?.uid) {
    showMachineCtxMenu(e.clientX, e.clientY, machine.dataset.uid);
    return;
  }
  const zone = e.target.closest?.(".zone-shape");
  if (zone?.dataset?.uid) {
    showZoneCtxMenu(e.clientX, e.clientY, zone.dataset.uid);
    return;
  }
  hideCtxMenu();
}

function saveLayout() {
  if (el.btnSave?.disabled) return;
  if (state.conflictPending) {
    openConflictModal(state.conflictServerData);
    return;
  }
  el.btnSave.disabled = true;
  touchTabLock();
  enqueueSave({ auto: false })
    .catch((err) => {
      console.error(err);
      flash("保存失敗");
      state.saveStatus = "error";
      showSaveToast("保存に失敗しました", { error: true });
    })
    .finally(() => {
      el.btnSave.disabled = false;
      updateDirtyUi();
    });
}

function loadLayout() {
  loadCloud(true).catch((err) => {
    console.error(err);
    flash("読込失敗");
  });
}

async function exportPng() {
  flash("…");
  const floor = document.getElementById("floor");
  await floor.decode?.().catch(() => {});
  const canvas = document.createElement("canvas");
  canvas.width = PLAN_W;
  canvas.height = PLAN_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PLAN_W, PLAN_H);
  ctx.drawImage(floor, 0, 0, PLAN_W, PLAN_H);

  for (const z of state.zones) {
    ctx.save();
    ctx.fillStyle = z.color || "rgba(213,216,220,0.45)";
    ctx.strokeStyle = "rgba(17,17,17,0.35)";
    ctx.lineWidth = 2;
    const bx = z.type === "circle" ? z.cx : z.x + z.w / 2;
    const by = z.type === "circle" ? z.cy : z.y + z.h / 2;
    if (z.type === "circle") {
      ctx.beginPath();
      ctx.arc(z.cx, z.cy, z.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeRect(z.x, z.y, z.w, z.h);
    }
    if (z.label) {
      const lx = bx + (Number(z.labelDx) || 0);
      const ly = by + (Number(z.labelDy) || 0);
      ctx.translate(lx, ly);
      ctx.scale(z.flipX ? -1 : 1, z.flipY ? -1 : 1);
      ctx.fillStyle = "#111111";
      ctx.font = "bold 28px 'Noto Sans JP', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (z.vertical) {
        const chars = [...String(z.label)];
        const lineH = 30;
        const startY = -((chars.length - 1) * lineH) / 2;
        chars.forEach((ch, i) => ctx.fillText(ch, 0, startY + i * lineH));
      } else {
        ctx.fillText(z.label, 0, 0);
      }
    }
    ctx.restore();
  }

  for (const item of state.items) {
    if (item.hidden) continue;
    const m = findMachine(item.id);
    if (!m) continue;
    const body = itemBodySize(m, item);
    const drawW = item.trimmed ? body.bw : body.mw;
    const drawH = item.trimmed ? body.bh : body.mh;
    const cx = item.x + drawW / 2;
    const cy = item.y + drawH / 2;
    const artUrl = machinePlaceUrl(m);
    const useArt = !!artUrl;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((item.rot || 0) * Math.PI) / 180);
    if (useArt) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = artUrl;
      await img.decode().catch(() => {});
      // 外側＝区画（線）、写真＝本体サイズのみ中央
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-drawW / 2, -drawH / 2, drawW, drawH);
      if (!item.trimmed) {
        ctx.strokeStyle = "#64748b";
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(-body.bw / 2, -body.bh / 2, body.bw, body.bh);
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(236,238,241,0.92)";
        ctx.fillRect(-body.bw / 2, -body.bh / 2, body.bw, body.bh);
        ctx.drawImage(img, -body.bw / 2, -body.bh / 2, body.bw, body.bh);
        drawDimOverlayOnCanvas(ctx, body.bw, body.bh);
      } else {
        ctx.fillStyle = "#eceef1";
        ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        drawDimOverlayOnCanvas(ctx, drawW, drawH);
      }
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 2;
      ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
      ctx.strokeRect(-drawW / 2, -drawH / 2, drawW, drawH);
      if (!item.trimmed) {
        ctx.strokeStyle = "#64748b";
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(-body.bw / 2, -body.bh / 2, body.bw, body.bh);
        ctx.setLineDash([]);
      }
      ctx.fillStyle = "#111111";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = String(m.name || "").slice(0, 18);
      ctx.fillText(label, 0, 0);
      drawDimOverlayOnCanvas(ctx, item.trimmed ? drawW : body.bw, item.trimmed ? drawH : body.bh);
    }
    ctx.restore();
  }

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${state.roomId}-${Date.now()}.png`;
  a.click();
  flash("PNG");
}

function flash(msg) {
  if (el.statusSel) el.statusSel.textContent = msg;
}

function showEditSuccessToast(message) {
  showSaveToast(message);
  flash(message);
}

function rotateSelected() {
  const sels = selectedItems().filter((it) => !it.locked);
  if (!sels.length) {
    if (selectedItems().some((it) => it.locked)) flash("ロック中");
    return;
  }
  pushUndo();
  for (const item of sels) {
    const m = findMachine(item.id);
    if (!m) continue;
    item.rot = (item.rot + 90) % 360;
    clampItem(item, m);
  }
  renderMachines();
  markDirty({ immediate: true });
}

function dupSelected() {
  pasteClipboard(
    selectedItems().map((it) => ({
      id: it.id,
      x: it.x,
      y: it.y,
      rot: it.rot,
      hidden: !!it.hidden,
      trimmed: !!it.trimmed,
      locked: false,
    })),
    40,
    40
  );
}

function delSelectedZones() {
  if (!state.selectedZoneUids.size) return;
  pushUndo();
  state.zones = state.zones.filter((z) => !state.selectedZoneUids.has(z.uid));
  state.selectedZoneUids = new Set();
  clearZoneEdit();
  renderZones();
  renderMachines();
  updateChrome();
  markDirty();
  flash("ゾーン削除");
}

function delSelected() {
  if (!state.selectedUids.size && !state.selectedZoneUids.size) return;
  if (state.selectedZoneUids.size && !state.selectedUids.size) {
    delSelectedZones();
    return;
  }
  pushUndo();
  if (state.selectedUids.size) {
    state.items = state.items.filter((i) => !state.selectedUids.has(i.uid));
    state.selectedUids = new Set();
  }
  if (state.selectedZoneUids.size) {
    state.zones = state.zones.filter((z) => !state.selectedZoneUids.has(z.uid));
    state.selectedZoneUids = new Set();
  }
  clearZoneEdit();
  renderZones();
  renderMachines();
  renderPalette();
  updateChrome();
  markDirty();
}

function copySelected() {
  const sels = selectedItems();
  if (!sels.length) {
    flash("未選択");
    return;
  }
  state.clipboard = sels.map((it) => ({
    id: it.id,
    x: it.x,
    y: it.y,
    rot: it.rot,
    hidden: !!it.hidden,
    trimmed: !!it.trimmed,
  }));
  flash(`コピー ${sels.length}`);
}

function pasteClipboard(source = state.clipboard, dx = 40, dy = 40) {
  if (!source?.length) {
    flash("なし");
    return;
  }
  const created = [];
  let skipped = 0;
  pushUndo();
  for (const it of source) {
    const m = findMachine(it.id);
    if (!m) {
      skipped++;
      continue;
    }
    if (!canPlaceMore(it.id)) {
      skipped++;
      continue;
    }
    const item = {
      uid: uid(),
      id: it.id,
      x: it.x + dx,
      y: it.y + dy,
      rot: it.rot || 0,
      hidden: !!it.hidden,
      trimmed: !!it.trimmed,
      locked: false,
      place_px_w: m.place_px_w,
      place_px_h: m.place_px_h,
      clearance_cm: m.clearance_cm || DEFAULT_CLEARANCE_CM,
    };
    clampItem(item, m);
    state.items.push(item);
    created.push(item.uid);
  }
  if (!created.length) {
    state.undoStack.pop();
    flash(skipped ? "残不足" : "なし");
    renderPalette();
    return;
  }
  state.selectedUids = new Set(created);
  state.clipboard = created.map((u) => {
    const it = state.items.find((i) => i.uid === u);
    return { id: it.id, x: it.x, y: it.y, rot: it.rot, hidden: !!it.hidden };
  });
  renderMachines();
  markDirty();
  flash(skipped ? `貼付 ${created.length} 残不足${skipped}` : `貼付 ${created.length}`);
}

function setMachineModalMode(mode, machine = null) {
  const isEdit = mode === "edit";
  if (el.addMachineTitle) el.addMachineTitle.textContent = isEdit ? "マシン変更" : "マシン追加";
  if (el.addMachineLead) {
    el.addMachineLead.textContent = isEdit
      ? "IDはそのまま。配置済みマシンは消えず、サイズ・名称などが更新されます。スプレッドシート「追加マシン」へ保存できてから反映します。"
      : "スプレッドシート「追加マシン」に保存できてから図面一覧に出します。完了まで少し待つことがあります。";
  }
  if (el.addMachineEditId) el.addMachineEditId.value = isEdit ? machine?.id || "" : "";
  if (el.addMachineImage) el.addMachineImage.required = !isEdit;
  if (el.addMachineImageReq) el.addMachineImageReq.hidden = isEdit;
  if (el.addMachineImageHint) el.addMachineImageHint.hidden = !isEdit;
  if (el.addMachineSubmit) el.addMachineSubmit.textContent = isEdit ? "変更を保存" : "登録する";
  if (el.addMachineForm && isEdit && machine) {
    el.addMachineForm.querySelector('[name="name"]').value = machine.name || "";
    el.addMachineForm.querySelector('[name="link"]').value = machine.link || "";
    el.addMachineForm.querySelector('[name="width_cm"]').value = machine.width_cm || "";
    el.addMachineForm.querySelector('[name="length_cm"]').value = machine.length_cm || "";
    el.addMachineForm.querySelector('[name="qty"]').value = machine.qty || 1;
    el.addMachineForm.querySelector('[name="source"]').value =
      machine.source === "existing" ? "existing" : "new";
    el.addMachineForm.querySelector('[name="genre"]').value = machineGenre(machine) || "stack";
    el.addMachineForm.querySelector('[name="note"]').value = machine.note || "";
  }
  const byInput = el.addMachineForm?.querySelector("#add-machine-by");
  if (byInput) byInput.value = authorName();
  if (el.addMachinePreview) {
    const prev = machine ? machinePreviewUrl(machine) : "";
    if (prev) {
      el.addMachinePreview.hidden = false;
      el.addMachinePreview.src = prev;
    } else {
      el.addMachinePreview.hidden = true;
      el.addMachinePreview.removeAttribute("src");
    }
  }
}

function openAddMachineModal() {
  if (!el.addMachineModal) return;
  el.addMachineForm?.reset();
  setMachineModalMode("create");
  el.addMachineModal.hidden = false;
}

function openEditMachineModal(machineId) {
  const id = machineId || editableMachineId();
  const m = findMachine(id);
  if (!m) {
    flash("変更するマシンを選んでください");
    return;
  }
  if (!el.addMachineModal) return;
  el.addMachineForm?.reset();
  setMachineModalMode("edit", m);
  el.addMachineModal.hidden = false;
}

function closeAddMachineModal() {
  if (el.addMachineModal) el.addMachineModal.hidden = true;
  el.addMachineForm?.reset();
  if (el.addMachineEditId) el.addMachineEditId.value = "";
  if (el.addMachineImage) el.addMachineImage.required = true;
  if (el.addMachinePreview) {
    el.addMachinePreview.hidden = true;
    el.addMachinePreview.removeAttribute("src");
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** Canva等の大画像を縮小して API ボディ制限内に収める */
async function compressImageForUpload(file) {
  const maxSide = 1400;
  const maxBytes = 2.5 * 1024 * 1024;
  if (file.size <= maxBytes && file.size < 1.5 * 1024 * 1024) {
    return readFileAsBase64(file);
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eceef1";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > maxBytes * 1.37 && quality > 0.45) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

async function submitAddMachine(e) {
  e.preventDefault();
  const form = el.addMachineForm;
  if (!form) return;
  const fd = new FormData(form);
  const editId = String(fd.get("edit_id") || "").trim();
  const isEdit = !!editId;
  const name = String(fd.get("name") || "").trim();
  const link = String(fd.get("link") || "").trim();
  const width_cm = Number(fd.get("width_cm"));
  const length_cm = Number(fd.get("length_cm"));
  const qty = Number(fd.get("qty") || 1);
  const source = String(fd.get("source") || "new");
  const genre = String(fd.get("genre") || "stack");
  const note = String(fd.get("note") || "").trim();
  const by = String(fd.get("by") || authorName()).trim();
  const file = el.addMachineImage?.files?.[0];
  if (!isEdit && !file) {
    flash("画像を選んでください");
    return;
  }
  const btn = el.addMachineSubmit || form.querySelector('button[type="submit"]');
  if (btn) {
    btn.disabled = true;
        btn.textContent = isEdit ? "シートへ保存中…" : "シートへ保存中…";
  }
  try {
    flash(isEdit ? "変更を保存中…" : "登録中…");
    const imageBase64 = file ? await compressImageForUpload(file) : undefined;
    const res = await fetch(MACHINE_ADD_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: isEdit ? "update" : "create",
        id: editId || undefined,
        name,
        link,
        width_cm,
        length_cm,
        qty,
        source,
        genre,
        note,
        by,
        ...(imageBase64 ? { imageBase64 } : {}),
      }),
    });
    let json = {};
    try {
      json = await res.json();
    } catch {
      throw new Error(`HTTP ${res.status}`);
    }
    if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
    closeAddMachineModal();

    const machineId = json.machine?.id || editId;
    // 先に中心を記録 → カタログ反映 → 同位置に最適サイズで置き直し
    const centers = isEdit ? snapshotPlacementCenters() : null;
    if (json.machine) upsertCatalogMachine(json.machine);
    if (isEdit && machineId) syncPlacedItemsToCatalog(machineId);
    if (centers) restorePlacementCenters(centers);

    // バックグラウンドで最新カタログも取り直す（失敗してもローカル反映は維持）
    try {
      await loadCatalog();
      if (json.machine) upsertCatalogMachine(json.machine);
      if (isEdit && machineId) {
        syncPlacedItemsToCatalog(machineId);
        if (centers) restorePlacementCenters(centers);
      }
    } catch (err) {
      console.warn("catalog refresh after edit failed", err);
    }

    if (isEdit && machineId) {
      const kept = state.items.filter((it) => it.id === machineId && !it.hidden);
      if (kept.length) state.selectedUids = new Set(kept.map((it) => it.uid));
    }
    state.paletteFocusId = machineId || state.paletteFocusId;
    renderPalette();
    renderMachines();
    if (isEdit) markDirty({ immediate: true });
    updateChrome();

    if (isEdit) {
      showEditSuccessToast(`サイズを変更しました（${width_cm}×${length_cm}cm・配置維持）`);
    } else {
      showEditSuccessToast(`追加しました: ${json.machine?.name || name}`);
    }
  } catch (err) {
    console.error(err);
    flash(`${isEdit ? "変更" : "追加"}失敗: ${err.message || err}`);
    alert(`マシン${isEdit ? "変更" : "追加"}に失敗しました\n${err.message || err}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = isEdit ? "変更を保存" : "登録する";
    }
  }
}

async function loadCatalog() {
  // 本番: 既存マシンシート直結。失敗時はローカルCSVへフォールバック
  try {
    const res = await fetch(`${MACHINES_API}?t=${Date.now()}`, { cache: "no-store" });
    const json = await res.json();
    if (res.ok && json.ok && Array.isArray(json.machines) && json.machines.length) {
      state.catalog = json.machines.map((m) => normalizeCatalogMachine(m));
      return {
        source: "sheet",
        count: state.catalog.length,
        existingCount: json.existingCount,
        newCount: json.newCount,
      };
    }
  } catch (err) {
    console.warn("machines api failed", err);
  }

  const [csvRes, catalogRes] = await Promise.all([fetch(CSV_URL), fetch(CATALOG_URL)]);
  const text = await csvRes.text();
  const nameById = Object.fromEntries(
    (await catalogRes.json()).map((m) => [m.id, m.name])
  );
  state.catalog = parseCsv(text).map((m) => ({
    ...m,
    name: nameById[m.id] || m.name,
    source: "existing",
    genre: m.category === "cardio" ? "cardio" : m.category === "freeweight" ? "freeweight" : "stack",
    has_art: true,
    place_px_w: m.place_px_w || m.width_cm + DEFAULT_CLEARANCE_CM * 2,
    place_px_h: m.place_px_h || m.length_cm + DEFAULT_CLEARANCE_CM * 2,
    module_width_cm: m.module_width_cm || m.width_cm + DEFAULT_CLEARANCE_CM * 2,
    module_length_cm: m.module_length_cm || m.length_cm + DEFAULT_CLEARANCE_CM * 2,
    place_file: m.place_file || `${m.id}_place.png`,
    preview_file: m.preview_file || `${m.id}_preview.png`,
  }));
  return { source: "local", count: state.catalog.length };
}

async function init() {
  state.roomId = roomFromUrl();
  applyRoomConfig(state.roomId);
  if (el.author) {
    el.author.value = localStorage.getItem(AUTHOR_KEY) || "";
    el.author.addEventListener("change", () => {
      localStorage.setItem(AUTHOR_KEY, el.author.value.trim().slice(0, 40));
    });
  }
  const normalized = shareUrl();
  if (normalized !== location.href) {
    history.replaceState(null, "", normalized);
  }

  if (el.floorSelect) {
    el.floorSelect.addEventListener("change", () => {
      const next = el.floorSelect.value;
      switchRoom(next).catch((err) => {
        console.error(err);
        flash("フロア切替失敗");
      });
    });
  }

  // F5 / 戻るでも必ず最新配置を取り直す（bfcacheの古い画面を残さない）
  window.addEventListener("pageshow", (e) => {
    const urlRoom = roomFromUrl();
    if (urlRoom !== state.roomId) {
      switchRoom(urlRoom).catch(console.error);
      return;
    }
    if (e.persisted) {
      loadCloud(true).catch(console.error);
    }
  });

  const loaded = await loadCatalog();
  renderPalette();
  bindDrop();
  fitView();
  updateChrome();
  flash(
    loaded.source === "sheet"
      ? `既存${loaded.existingCount ?? "?"} 新規${loaded.newCount ?? 0}`
      : `ローカル ${loaded.count}`
  );

  el.search.addEventListener("input", () => {
    state.query = el.search.value;
    renderPalette();
  });
  if (el.sourceFilters) {
    el.sourceFilters.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      state.source = btn.dataset.source || "existing";
      el.sourceFilters.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === btn));
      renderPalette();
    });
  }
  el.filters.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.filter = btn.dataset.genre || btn.dataset.cat || "all";
    el.filters.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === btn));
    renderPalette();
  });

  el.viewport.addEventListener("pointerdown", onViewportPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  el.viewport.addEventListener("wheel", onWheel, { passive: false });
  el.viewport.addEventListener("contextmenu", onViewportContextMenu);
  window.addEventListener("pointerdown", (e) => {
    if (!e.target.closest?.("#ctx-menu")) hideCtxMenu();
  });

  el.conflictKeepMine?.addEventListener("click", () => {
    resolveConflictKeepMine().catch(console.error);
  });
  el.conflictTakeServer?.addEventListener("click", () => {
    resolveConflictTakeServer().catch(console.error);
  });
  el.conflictLater?.addEventListener("click", () => resolveConflictLater());

  updateSaveStatusUi();

  window.addEventListener("keydown", (e) => {
    const typing = e.target.matches("input, textarea, select");
    if (e.code === "Space" && !typing) {
      state.spaceDown = true;
      e.preventDefault();
    }
    if (typing) return;
    if (e.key === "Escape" && state.zoneEditUid) {
      clearZoneEdit();
      renderZones();
      updateChrome();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && (state.selectedUids.size || state.selectedZoneUids.size)) {
      e.preventDefault();
      delSelected();
    }
    if ((e.key === "s" || e.key === "S") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveLayout();
    }
    if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      undoLast();
    }
    if ((e.key === "c" || e.key === "C") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      copySelected();
    }
    if ((e.key === "v" || e.key === "V") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      pasteClipboard();
    }
    if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      state.selectedUids = new Set(state.items.filter((i) => !i.hidden).map((i) => i.uid));
      renderMachines();
    }
    if (e.key === "r" || e.key === "R") rotateSelected();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") state.spaceDown = false;
  });
  window.addEventListener("resize", () => fitView());
  window.addEventListener("beforeunload", (e) => {
    rememberLastGood({
      updatedAt: state.updatedAt || new Date().toISOString(),
      updatedBy: authorName(),
      items: state.items,
      zones: state.zones,
    });
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });
  window.addEventListener("pagehide", () => {
    rememberLastGood({
      updatedAt: state.updatedAt || new Date().toISOString(),
      updatedBy: authorName(),
      items: state.items,
      zones: state.zones,
    });
    if (!state.dirty || state.conflictPending) return;
    const body = JSON.stringify({
      by: authorName(),
      items: state.items,
      zones: state.zones,
      auto: true,
      force: false,
      note: "自動保存",
      baseUpdatedAt: state.updatedAt || undefined,
    });
    try {
      fetch(`/api/room?id=${encodeURIComponent(state.roomId)}&t=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    } catch {
      /* ignore */
    }
  });
  window.addEventListener("focus", () => touchTabLock());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") touchTabLock();
  });
  setInterval(() => {
    if (document.visibilityState === "visible") touchTabLock();
  }, 3000);

  el.btnRotate?.addEventListener("click", rotateSelected);
  el.btnLock?.addEventListener("click", toggleLockSelected);
  el.btnSave?.addEventListener("click", saveLayout);
  el.btnZoneRect?.addEventListener("click", () => setZoneTool(state.zoneTool === "rect" ? null : "rect"));
  el.btnZoneOff?.addEventListener("click", () => setZoneTool(null));
  el.btnZoneVertical?.addEventListener("click", toggleSelectedZonesVertical);
  el.btnZoneFlipX?.addEventListener("click", () => flipSelectedZones("x"));
  el.btnZoneFlipY?.addEventListener("click", () => flipSelectedZones("y"));
  el.zoneLabel?.addEventListener("change", applyZoneLabelFromInput);
  el.zoneLabel?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyZoneLabelFromInput();
    }
  });
  el.zoneFreetext?.addEventListener("change", applyFreeTextFromInput);
  el.zoneFreetext?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyFreeTextFromInput();
    }
  });
  el.viewport?.addEventListener("dblclick", (e) => {
    if (e.target.closest(".machine")) return;
    if (e.target.closest(".zone-shape") || e.target.closest(".zone-label-text")) return;
    e.preventDefault();
    placeFreeTextAt(clientToPlan(e.clientX, e.clientY));
  });
  initZoneColors();

  el.btnAddMachine?.addEventListener("click", () => openAddMachineModal());
  el.btnEditMachine?.addEventListener("click", () => openEditMachineModal());
  el.addMachineCancel?.addEventListener("click", () => closeAddMachineModal());
  el.addMachineModal?.addEventListener("click", (ev) => {
    if (ev.target === el.addMachineModal) closeAddMachineModal();
  });
  el.addMachineForm?.addEventListener("submit", (ev) => {
    submitAddMachine(ev).catch(console.error);
  });
  el.addMachineImage?.addEventListener("change", () => {
    const file = el.addMachineImage.files?.[0];
    if (!file || !el.addMachinePreview) return;
    el.addMachinePreview.hidden = false;
    el.addMachinePreview.src = URL.createObjectURL(file);
  });

  await loadCloud(true).catch((err) => {
    console.error(err);
    flash("読込失敗");
  });
}

init().catch((err) => {
  console.error(err);
  flash("エラー");
});
