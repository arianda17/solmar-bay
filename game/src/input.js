const keys = new Map();
const pressed = new Set();
let mouseDX = 0;
let mouseDY = 0;
let mouseDown = false;
let rightDown = false;
let wheelDelta = 0;
let dragging = false;
let lastDragX = 0;
let lastDragY = 0;
let locked = false;
let attached = false;
let padIndex = -1;
function onKeyDown(e) {
  if (e.repeat) return;
  keys.set(e.code, true);
  pressed.add(e.code);
  if (e.code === "Space") e.preventDefault();
}
function onKeyUp(e) { keys.set(e.code, false); }
function onMouseMove(e) {
  if (locked) { mouseDX += e.movementX || 0; mouseDY += e.movementY || 0; }
  else if (dragging) {
    mouseDX += (e.clientX - lastDragX) * 1.4;
    mouseDY += (e.clientY - lastDragY) * 1.4;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
  }
}
function onMouseDown(e) {
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) rightDown = true;
  if (!locked) { dragging = true; lastDragX = e.clientX; lastDragY = e.clientY; }
}
function onMouseUp(e) {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) rightDown = false;
  dragging = false;
}
function onWheel(e) { wheelDelta += e.deltaY; }
function onLockChange() { locked = document.pointerLockElement != null; }
function onGamepad(e) { padIndex = e.gamepad.index; }
export function inputAttach(canvas) {
  if (attached || typeof window === "undefined") return;
  attached = true;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("wheel", onWheel);
  window.addEventListener("gamepadconnected", onGamepad);
  document.addEventListener("pointerlockchange", onLockChange);
  if (canvas) canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}
export function inputUpdate() {
  const snap = { dx: mouseDX, dy: mouseDY, wheel: wheelDelta, fire: mouseDown, aim: rightDown };
  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
  return snap;
}
export function consumePressed() {
  const out = new Set(pressed);
  pressed.clear();
  return out;
}
function pad() {
  if (padIndex < 0 || typeof navigator === "undefined") return null;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  return pads && pads[padIndex] ? pads[padIndex] : null;
}
export function moveIntent() {
  let x = 0;
  let y = 0;
  if (keys.get("KeyW")) y += 1;
  if (keys.get("KeyS")) y -= 1;
  if (keys.get("KeyA")) x -= 1;
  if (keys.get("KeyD")) x += 1;
  const gp = pad();
  if (gp) {
    x += gp.axes[0] || 0;
    y -= gp.axes[1] || 0;
  }
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y };
}
export function handbrake() {
  const gp = pad();
  return keys.get("Space") || (gp ? !!(gp.buttons[0] && gp.buttons[0].pressed) : false);
}
export function sprint() {
  return !!(keys.get("ShiftLeft") || keys.get("ShiftRight"));
}
export function enterExitPressed() { return pressed.has("KeyE"); }
export function punchPressed() { return mouseDown && !rightDown; }
export function aimPressed() { return rightDown; }
export function firePressed() { return mouseDown; }
export function radioStep() {
  if (!pressed.has("KeyQ")) return 0;
  return 1;
}
export function pointerLockToggle(canvas) {
  if (!canvas || typeof document === "undefined") return false;
  if (document.pointerLockElement) { document.exitPointerLock(); return false; }
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); return true; } catch (err) { return false; }
}
export function isPointerLocked() { return locked; }
export function lookDelta() { const d = { dx: mouseDX, dy: mouseDY }; mouseDX = 0; mouseDY = 0; return d; }
export function keyPressed(code) { return pressed.has(code); }
export function keyHeld(code) { return keys.get(code) || false; }
