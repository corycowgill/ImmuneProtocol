// Small DOM and formatting helpers shared by the game's interface modules.

export const byId = id => document.getElementById(id);
export const isTouch = matchMedia('(pointer: coarse)').matches;
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const pad = number => String(number).padStart(2, '0');
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function setText(element, value) {
  const text = String(value);
  if (element.textContent !== text) element.textContent = text;
}
