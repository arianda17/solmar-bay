// input.js — keyboard / mouse / gamepad intent. Poll-based: main.js reads
// intent each tick; no per-frame allocations, no wall clock.
const KEYS = {
  KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
  ShiftLeft: "sprint", ShiftRight: "sprint", Space: "jump",
  KeyE: "interact", KeyR: "reload", KeyQ: "radio", KeyH: "horn",
  KeyL: "lights", KeyM: "map", KeyV: "recenter", KeyC: "cam",
  Escape: "pause", Enter: "advance", Digit1: "w1", Digit2: "w2", Digit3: "w3",
};
export function createInput(canvas) {
  const down = new Set(), hit = new Set();
  let lookX = 0, lookY = 0, locked = false, dragging = false, lx = 0, ly = 0;
  const onKey = e => {
    const k = KEYS[e.code];
    if (!k) return;
    if (e.type === "keydown") { if (!down.has(k)) hit.add(k); down.add(k); }
    else down.delete(k);
    if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) e.preventDefault();
  };
  const onMouse = e => {
    if (e.type === "mousedown") { hit.add(e.button === 2 ? "aim" : "fire"); down.add(e.button === 2 ? "aim" : "fire"); dragging = true; lx = e.clientX; ly = e.clientY; }
    if (e.type === "mouseup") { down.delete(e.button === 2 ? "aim" : "fire"); dragging = false; }
    if (e.type === "mousemove") {
      if (document.pointerLockElement === canvas) { lookX += e.movementX; lookY += e.movementY; }
      else if (dragging) { lookX += (e.clientX - lx) * 2; lookY += (e.clientY - ly) * 2; lx = e.clientX; ly = e.clientY; }
    }
    if (e.type === "contextmenu") e.preventDefault();
  };
  const onWheel = e => { hit.add(e.deltaY < 0 ? "wheelUp" : "wheelDown"); };
  canvas.addEventListener("click", () => { if (!locked) canvas.requestPointerLock?.(); });
  document.addEventListener("pointerlockchange", () => { locked = document.pointerLockElement === canvas; });
  addEventListener("keydown", onKey); addEventListener("keyup", onKey);
  addEventListener("mousedown", onMouse); addEventListener("mouseup", onMouse);
  addEventListener("mousemove", onMouse); addEventListener("wheel", onWheel);
  canvas.addEventListener("contextmenu", onMouse);
  // Intent snapshot for one tick. Edge presses live in `hit` until consumed.
  return {
    get locked() { return locked; },
    pressed(k) { return hit.has(k); },
    held(k) { return down.has(k); },
    consume() { hit.clear(); },
    look() { const r = { x: lookX, y: lookY }; lookX = 0; lookY = 0; return r; },
    move() {
      return {
        x: (down.has("right") ? 1 : 0) - (down.has("left") ? 1 : 0),
        y: (down.has("up") ? 1 : 0) - (down.has("down") ? 1 : 0),
        sprint: down.has("sprint"), jump: down.has("jump"), aim: down.has("aim"),
      };
    },
    // Gamepad: left stick move, A jump, RT fire, Start pause. Polled, no events.
    pad() {
      const p = navigator.getGamepads?.()[0];
      if (!p) return null;
      const dz = v => Math.abs(v) < 0.12 ? 0 : v;
      return {
        x: dz(p.axes[0] || 0), y: -dz(p.axes[1] || 0),
        sprint: p.buttons[10]?.pressed, jump: p.buttons[0]?.pressed,
        fire: p.buttons[7]?.value > 0.4, pause: p.buttons[9]?.pressed,
      };
    },
  };
}
