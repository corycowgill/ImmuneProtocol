const CONTROLS = 'button, a[href], select, input:not([type="hidden"]), summary';
const ALIGNMENT_WEIGHT = 2;
const FIRST_REPEAT_DELAY = 330;
const REPEAT_INTERVAL = 115;
const STICK_THRESHOLD = .55;
const STICK_RELEASE_THRESHOLD = .36;

function topDialog(document) {
  const focusedDialog = document.activeElement?.closest('dialog:modal');
  if (focusedDialog) return focusedDialog;
  const dialogs = document.querySelectorAll('dialog:modal');
  return dialogs[dialogs.length - 1] ?? null;
}

function isAvailable(control) {
  if (control.matches(':disabled, [aria-disabled="true"]') ||
      control.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const details = control.closest('details:not([open])');
  if (details && control !== details.querySelector(':scope > summary')) return false;
  const { width, height } = control.getBoundingClientRect();
  return width > 0 && height > 0 && getComputedStyle(control).visibility === 'visible';
}

function directionFor(pad, previous) {
  const x = pad.menuX;
  const y = pad.menuY;
  const horizontal = Math.abs(x);
  const vertical = Math.abs(y);
  const strongest = Math.max(horizontal, vertical);
  if (strongest < (previous ? STICK_RELEASE_THRESHOLD : STICK_THRESHOLD)) return null;
  if (previous && Math.abs(horizontal - vertical) < .12) {
    if (previous === 'left' || previous === 'right') return x < 0 ? 'left' : 'right';
    return y < 0 ? 'up' : 'down';
  }
  if (horizontal > vertical) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

function nearestControl(current, controls, direction) {
  const vertical = direction === 'up' || direction === 'down';
  const sign = direction === 'up' || direction === 'left' ? -1 : 1;
  const axis = vertical ? 'top' : 'left';
  const across = vertical ? 'left' : 'top';
  const length = vertical ? 'height' : 'width';
  const span = vertical ? 'width' : 'height';
  const source = current.getBoundingClientRect();
  const center = source[axis] + source[length] / 2;
  let closest;
  let best = Infinity;

  for (const control of controls) {
    if (control === current) continue;
    const target = control.getBoundingClientRect();
    const ahead = (target[axis] + target[length] / 2 - center) * sign;
    if (ahead < Math.min(12, (source[length] + target[length]) * .2)) continue;
    const nearEdge = sign > 0 ? target[axis] : target[axis] + target[length];
    if ((nearEdge - center) * sign < -8) continue;
    const between = Math.max(0, source[across] - (target[across] + target[span]), target[across] - (source[across] + source[span]));
    const offset = Math.abs(target[across] + target[span] / 2 - source[across] - source[span] / 2);
    const score = ahead + between * ALIGNMENT_WEIGHT + offset * .2;
    if (score < best) {
      closest = control;
      best = score;
    }
  }
  return closest;
}

function stepSelect(control, step, wrap = false) {
  const count = control.options.length;
  if (count === 0) return;
  for (let distance = 1; distance <= count; distance++) {
    let index = control.selectedIndex + distance * step;
    if (wrap) index = (index + count) % count;
    const option = control.options[index];
    if (!option) return;
    if (option.disabled || option.hidden || option.closest('optgroup[disabled]')) continue;
    if (index !== control.selectedIndex) {
      control.selectedIndex = index;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return;
  }
}

function stepRange(control, step) {
  if (control.readOnly || control.step === 'any') return;
  const previous = control.value;
  if (step > 0) control.stepUp();
  else control.stepDown();
  if (control.value === previous) return;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function scrollMenu(current, direction) {
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  for (let element = current.parentElement; element; element = element.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(element);
    const overflow = horizontal ? overflowX : overflowY;
    const available = horizontal ? element.scrollWidth > element.clientWidth : element.scrollHeight > element.clientHeight;
    if (available && ['auto', 'scroll'].includes(overflow)) {
      element.scrollBy(horizontal ? { left: 90 * sign } : { top: 90 * sign });
      return;
    }
  }
}

export class GamepadMenu {
  constructor({ main, onBack }) {
    this.main = main;
    this.onBack = onBack;
    this.reset();
  }

  reset() {
    this.focused?.removeAttribute('data-gamepad-focus');
    this.focused = null;
    this.scope = null;
    this.direction = null;
    this.repeatAt = 0;
  }

  highlight(control) {
    if (this.focused === control) return;
    this.focused?.removeAttribute('data-gamepad-focus');
    this.focused = control;
    control.setAttribute('data-gamepad-focus', '');
  }

  focus(control, followsSelection = false) {
    control.focus({ preventScroll: true, focusVisible: true });
    if (control.ownerDocument.activeElement !== control) return;
    this.highlight(control);
    control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (followsSelection && control.matches('[role="tab"], [role="radio"]')) control.click();
  }

  update(pad, now) {
    const document = this.main.ownerDocument;
    const dialog = topDialog(document);
    const scope = dialog ?? this.main;
    if (scope !== this.scope) {
      this.reset();
      this.scope = scope;
    }

    const direction = directionFor(pad, this.direction);
    const repeated = direction === this.direction;
    const move = direction && (!repeated || now >= this.repeatAt);
    this.direction = direction;
    if (move) this.repeatAt = now + (repeated ? REPEAT_INTERVAL : FIRST_REPEAT_DELAY);

    const { confirm, back, pause } = pad.pressed;
    if (back || pause) {
      this.onBack?.(dialog, back ? 'back' : 'pause');
      return;
    }
    let current = document.activeElement;
    if (!move && !confirm && (!pad.active || current === this.focused)) return;

    const controls = [...scope.querySelectorAll(CONTROLS)].filter(isAvailable);
    if (!controls.includes(current)) {
      const defaultControl = controls.find(control => control.matches('[data-gamepad-default], [autofocus], .menu-campaign'));
      current = defaultControl ?? controls[0];
      if (!current) return;
      this.focus(current);
      if (!confirm || !defaultControl || document.activeElement !== current) return;
    }
    this.highlight(current);

    if (confirm) {
      if (current.matches('select')) stepSelect(current, 1, true);
      else current.click();
      return;
    }
    if (!move) return;

    if (direction === 'left' || direction === 'right') {
      const step = direction === 'left' ? -1 : 1;
      if (current.matches('select')) {
        stepSelect(current, step);
        return;
      }
      if (current.matches('input[type="range"]')) {
        stepRange(current, step);
        return;
      }
    }
    const next = nearestControl(current, controls, direction);
    if (next) this.focus(next, true);
    else scrollMenu(current, direction);
  }
}
