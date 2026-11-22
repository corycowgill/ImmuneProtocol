// A bounded bridge for existing live 3D previews. Copies immediately after WebGL
// renders, before its drawing buffer is discarded; no second WebGL context.
const frames = new WeakMap();
let active = false;
let maximum = Infinity;
export function enableUiMedia(maxDimension = Infinity) { active = true; maximum = maxDimension; }
export function publishUiFrame(source) {
  if (!active || !source.width || !source.height) return;
  let frame = frames.get(source);
  if (!frame) { frame = document.createElement('canvas'); frames.set(source, frame); }
  const scale = Math.min(1, maximum / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale)), height = Math.max(1, Math.round(source.height * scale));
  if (frame.width !== width || frame.height !== height) { frame.width = width; frame.height = height; }
  frame.getContext('2d').drawImage(source, 0, 0, width, height);
}
export function uiFrame(source) { return frames.get(source) ?? source; }
