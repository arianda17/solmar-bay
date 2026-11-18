import { TICK_DT } from './sim.js';
import { radioStep } from './input.js';
let S = null;
let rafStarted = false;
let toasts = [];
let weaponEl = null;
let radioEl = null;
let crosshairEl = null;
let hitmarkerEl = null;
let speedEl = null;
let lastHitTick = -1;
let lastCash = null;
function doc() {
  try { return (typeof document !== 'undefined') ? document : null; } catch (e) { return null; }
}
function el(id) {
  const d = doc();
  if (!d) return null;
  try { return d.getElementById(id); } catch (e) { return null; }
}
function makeDiv(id, css) {
  const d = doc();
  if (!d || !d.body) return null;
  let node = el(id);
  if (node) return node;
  try {
    node = d.createElement('div');
    node.id = id;
    node.style.cssText = css || '';
    d.body.appendChild(node);
  } catch (e) { return null; }
  return node;
}
function ensureOwnElements() {
  weaponEl = makeDiv('solmar-weapon',
    'position:fixed;right:16px;bottom:88px;color:#fff;font:600 15px system-ui,sans-serif;' +
    'text-shadow:0 1px 3px #000;pointer-events:none;z-index:40;text-align:right;');
  radioEl = makeDiv('solmar-radio',
    'position:fixed;right:16px;bottom:64px;color:#ffe9a8;font:600 13px system-ui,sans-serif;' +
    'text-shadow:0 1px 3px #000;pointer-events:none;z-index:40;text-align:right;');
  speedEl = makeDiv('solmar-speed',
    'position:fixed;right:16px;bottom:44px;color:#fff;font:700 20px system-ui,sans-serif;' +
    'text-shadow:0 1px 3px #000;pointer-events:none;z-index:40;text-align:right;');
  crosshairEl = makeDiv('solmar-crosshair',
    'position:fixed;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;' +
    'pointer-events:none;z-index:41;display:none;' +
    'background:radial-gradient(circle,transparent 7px,rgba(255,255,255,.9) 8px,transparent 9px);');
  hitmarkerEl = makeDiv('solmar-hitmarker',
    'position:fixed;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;' +
    'pointer-events:none;z-index:41;display:none;color:#fff;font:700 22px system-ui,sans-serif;' +
    'text-align:center;line-height:26px;text-shadow:0 0 4px #f00;');
  if (hitmarkerEl) hitmarkerEl.textContent = '×';
}
export function notificationAdd(text) {
  if (!text) return;
  toasts.push({ text: String(text), until: Date.now() + 2500 });
  if (toasts.length > 4) toasts.shift();
  const box = el('hud-toasts');
  const d = doc();
  if (box && d) {
    try {
      const node = d.createElement('div');
      node.textContent = String(text);
      node.style.cssText = 'background:rgba(0,0,0,.6);color:#fff;padding:6px 10px;margin-top:6px;border-radius:6px;font:500 13px system-ui,sans-serif;';
      box.appendChild(node);
      setTimeout(() => { try { node.remove(); } catch (e) { } }, 2600);
    } catch (e) { }
  }
  if (S && S.hud) S.hud.prompt = String(text);
}
export function hudDraw() {
  const st = S;
  if (!st) return;
  ensureOwnElements();
  const d = doc();
  if (!d) return;
  if (weaponEl && st.combat) {
    const names = { fists: 'Fists', pistol: 'Dockside 9', smg: 'Kite-45' };
    const slot = st.combat.slot || 'fists';
    let line = names[slot] || slot;
    if (slot !== 'fists') {
      line += ' ' + (st.combat.ammo[slot] || 0) + '/' + (st.combat.reserve[slot] || 0);
      if (st.combat.reloading) line += ' — reloading…';
    }
    if (weaponEl.textContent !== line) weaponEl.textContent = line;
  }
  if (radioEl && st.audio) {
    const line = st.audio.radioOn ? '♪ ' + (st.audio.stationName || 'Coastline FM') + '  [Q]' : '';
    if (radioEl.textContent !== line) radioEl.textContent = line;
  }
  if (speedEl) {
    const car = (st.player && st.player.vehicle && typeof st.player.vehicle === 'object') ? st.player.vehicle : null;
    const kmh = car ? Math.round(Math.abs(car.speed || 0) * 3.6) : 0;
    const line = car ? kmh + ' km/h' : '';
    if (speedEl.textContent !== line) speedEl.textContent = line;
  }
  if (crosshairEl) {
    const show = !!(st.combat && st.combat.aiming && st.player && st.player.onFoot !== false);
    crosshairEl.style.display = show ? 'block' : 'none';
  }
  if (hitmarkerEl) {
    const ht = (st.hud && st.hud.hitmarkerTick) || -1;
    if (ht !== lastHitTick) {
      lastHitTick = ht;
      if (ht >= 0) {
        hitmarkerEl.style.display = 'block';
        setTimeout(() => { try { hitmarkerEl.style.display = 'none'; } catch (e) { } }, 180);
      }
    }
  }
  const cash = st.player ? (st.player.cash || 0) : 0;
  if (lastCash != null && cash !== lastCash) cashDraw(cash, cash - lastCash);
  lastCash = cash;
  minimapDraw();
}
export function minimapDraw() {
  const st = S;
  const canvas = el('minimap');
  if (!st || !canvas || typeof canvas.getContext !== 'function') return;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width || 180, h = canvas.height || 180;
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
    const scale = R / 320; // far zoom ~320 m radius
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,24,32,.85)'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    const px = st.player ? st.player.pos.x : 0, pz = st.player ? st.player.pos.z : 0;
    const toMap = (x, z) => [cx + (x - px) * scale, cy + (z - pz) * scale];
    ctx.fillStyle = 'rgba(40,120,180,.5)';
    ctx.fillRect(0, cy + (900 - pz) * scale, w, h);
    const blips = (st.mission && st.mission.data && st.mission.data.blips) || [];
    for (const b of blips) {
      const [bx, bz] = toMap(b.pos.x, b.pos.z);
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath(); ctx.arc(bx, bz, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#e74c3c';
    for (const cop of (st.actors && st.actors.cops) || []) {
      const [bx, bz] = toMap(cop.pos.x, cop.pos.z);
      ctx.fillRect(bx - 2, bz - 2, 4, 4);
    }
    const heading = (st.player && st.player.heading) || 0;
    ctx.fillStyle = '#fff';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-heading);
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.stroke();
  } catch (e) { }
}
export function wantedStarsDraw(level, state) {
  const st = state || S;
  const node = el('wanted-stars');
  if (!node) return;
  const n = Math.max(0, Math.min(5, level || 0));
  let s = '';
  for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
  if (node.textContent !== s) node.textContent = s;
  node.style.color = n >= 4 ? '#ff5a5a' : '#ffd94a';
}
export function speedometerDraw() {
  hudDraw();
}
export function cashDraw(amount, delta) {
  if (!delta) return;
  const d = doc();
  if (!d || !d.body) return;
  try {
    const node = d.createElement('div');
    node.textContent = (delta > 0 ? '+' : '') + '$' + delta;
    node.style.cssText = 'position:fixed;left:16px;bottom:96px;color:' + (delta > 0 ? '#7dff8a' : '#ff7d7d') +
      ';font:700 15px system-ui,sans-serif;text-shadow:0 1px 3px #000;pointer-events:none;z-index:40;';
    d.body.appendChild(node);
    setTimeout(() => { try { node.remove(); } catch (e) { } }, 2000);
  } catch (e) { }
}
export function missionObjectiveDraw(text) {
  const st = S;
  if (st && st.hud) st.hud.objective = text || '';
  const node = el('hud-objective');
  if (node && node.textContent !== (text || '')) node.textContent = text || '';
}
export function crosshairDraw() {
  hudDraw();
}
export function hitmarker(hit) {
  if (!hit) return;
  const st = S;
  if (st && st.hud) st.hud.hitmarkerTick = st.tick || 0;
}
export function healthArmorBars(health, armor) {
  const st = S;
  if (st && st.hud) {
    st.hud.healthBar = Math.max(0, Math.min(100, health == null ? 100 : health));
    st.hud.armorBar = Math.max(0, Math.min(100, armor || 0));
  }
}
export function init(state) {
  S = state;
  if (state && state.hud) {
    if (state.hud.objective == null) state.hud.objective = '';
    if (state.hud.prompt == null) state.hud.prompt = '';
  }
  ensureOwnElements();
  if (!rafStarted && typeof requestAnimationFrame === 'function') {
    rafStarted = true;
    const loop = () => {
      try { hudDraw(); } catch (e) { }
      try { requestAnimationFrame(loop); } catch (e) { }
    };
    try { requestAnimationFrame(loop); } catch (e) { }
  }
}
export function update(state, dt) {
  void dt;
  S = state;
  if (!state.hud) state.hud = { objective: '', prompt: '' };
  if (state.mission && state.mission.current) {
    const dlg = state.mission.data && state.mission.data.dialogue;
    if (dlg && dlg.lines && dlg.lines[dlg.idx]) {
      state.hud.objective = dlg.lines[dlg.idx];
      state.hud.prompt = 'Enter / click to continue';
    } else if (state.mission.failed) {
      state.hud.objective = 'MISSION FAILED — ' + state.mission.failed;
      state.hud.prompt = 'Enter to retry from checkpoint';
    }
  }
  if (state.player && state.player.onFoot !== false && !state.player.vehicle && !state.hud.prompt) {
    state.hud.prompt = '';
  }
  hudDraw();
}
