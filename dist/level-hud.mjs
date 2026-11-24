// HUD and menu pieces for the expanded campaign: the third and fourth tissue-node readouts and markers, the
// wave-clear countdown banner, Free Mode cards for the Colonic Reservoir and Lymph Node, and the
// difficulty picker on the deployment screen.
import { Simulation } from './simulation.mjs';
import { DIFFICULTIES, applyDifficulty, normalizeDifficulty } from './difficulty.mjs';
import { readSetting, writeSetting } from './settings-store.mjs';

const DIFFICULTY_KEY = 'immune-protocol.difficulty';

const STYLE = `
.node-row[data-tissue-node="2"]{--node-color:#e7b4ff}
#tertiary-marker,#tertiary-edge{color:#e7b4ff}
#tertiary-edge{border-color:#e7b4ff80}
#tertiary-marker.under-attack,#tertiary-edge.under-attack{color:#ffbd92}
#tertiary-marker.critical,#tertiary-edge.critical{color:#ff8a73}
#tertiary-edge:is(.under-attack,.critical){border-color:currentColor}
.node-row[data-tissue-node="3"]{--node-color:#ffd58a}
#quaternary-marker,#quaternary-edge{color:#ffd58a}
#quaternary-edge{border-color:#ffd58a80}
#quaternary-marker.under-attack,#quaternary-edge.under-attack{color:#ffbd92}
#quaternary-marker.critical,#quaternary-edge.critical{color:#ff8a73}
#quaternary-edge:is(.under-attack,.critical){border-color:currentColor}
.wave-outro{position:absolute;left:50%;top:27%;transform:translateX(-50%);display:grid;justify-items:center;gap:4px;padding:12px 26px 14px;min-width:220px;border:1px solid #c8f79459;background:linear-gradient(180deg,#141a13d9,#0d100cc2);color:var(--green);text-align:center;pointer-events:none;box-shadow:0 0 28px #9bf4c41f;animation:outro-in .35s ease-out}
.wave-outro[hidden]{display:none}
.wave-outro span{font:800 clamp(16px,2vw,24px)/1 var(--display);letter-spacing:.14em}
.wave-outro strong{font:800 clamp(38px,5.4vw,70px)/1 var(--display);color:#f3ffd9;text-shadow:0 0 22px #9bf4c466}
.wave-outro small{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#e9e5bf}
.wave-outro-bar{width:100%;height:3px;background:#ffffff1f;margin-top:4px}
.wave-outro-bar div{height:100%;width:100%;background:var(--green);transform-origin:left;transition:transform .1s linear}
.wave-outro[data-final="true"]{border-color:#ffd58a80;color:#ffd58a}
.wave-outro[data-final="true"] .wave-outro-bar div{background:#ffd58a}
.difficulty-picker{position:relative;display:flex;align-items:center;gap:10px;min-height:42px;padding:3px 3px 3px 13px;border:1px solid #dfc5ae45;background:#140f12d9}
.difficulty-label{flex:none;font:600 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:#e4d7d0}
.difficulty-options{flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px}
.difficulty-options button{min-height:34px;padding:0 6px;border:1px solid transparent;background:transparent;color:#efe5dc;font:700 11px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;transition:background .18s,border-color .18s,color .18s}
.difficulty-options button:hover{border-color:#c8f79470;color:var(--green)}
.difficulty-options button:focus-visible{outline-offset:-4px}
.difficulty-options button[aria-checked="true"]{border-color:var(--green);background:#293224;color:var(--green)}
.difficulty-options button[data-difficulty="easy"][aria-checked="true"]{border-color:#8fe4dd;background:#1a2f2e;color:#9ff0e8}
.difficulty-options button[data-difficulty="hard"][aria-checked="true"]{border-color:#ff9a7a;background:#3a1f1a;color:#ffb39a}
.difficulty-detail{--tone:var(--green);position:absolute;z-index:6;left:calc(100% + 18px);top:50%;width:340px;padding:13px 15px 12px;border:1px solid #dfc5ae55;border-left:3px solid var(--tone);background:linear-gradient(145deg,#211816,#141113);box-shadow:0 22px 60px #000a;color:#eadfd6;font-size:12px;line-height:1.42;text-align:left;opacity:0;visibility:hidden;pointer-events:none;transform:translate(-6px,-50%);transition:opacity .16s,transform .16s,visibility 0s .16s}
.difficulty-detail[data-difficulty="easy"]{--tone:#8fe4dd}
.difficulty-detail[data-difficulty="hard"]{--tone:#ff9a7a}
.difficulty-detail strong{display:block;margin-bottom:4px;color:var(--tone);font:800 21px/1 var(--display);letter-spacing:.03em;text-transform:uppercase}
.difficulty-detail p{margin:0}
.difficulty-detail ul{margin:7px 0 0;padding-left:16px;color:#d9ccc3;font-size:11px;line-height:1.45}
.difficulty-detail li+li{margin-top:2px}
.difficulty-picker:is([data-open],:has(:focus-visible)) .difficulty-detail,:root[data-input="gamepad"] .difficulty-picker:focus-within .difficulty-detail{opacity:1;visibility:visible;transform:translate(0,-50%);transition:opacity .16s,transform .16s}
@media(hover:hover){.difficulty-picker:hover .difficulty-detail{opacity:1;visibility:visible;transform:translate(0,-50%);transition:opacity .16s,transform .16s}}
@media(max-width:1100px),(orientation:landscape) and (max-height:500px){
  .difficulty-detail{left:0;right:0;top:calc(100% + 6px);width:auto;transform:translateY(-6px)}
  .difficulty-picker:is(:hover,[data-open],:has(:focus-visible)) .difficulty-detail,:root[data-input="gamepad"] .difficulty-picker:focus-within .difficulty-detail{transform:none}
}
@media(max-height:800px) and (min-width:721px){
  .menu-navigation .menu-option{min-height:58px}
  .menu-navigation .menu-campaign{min-height:64px}
}
@keyframes outro-in{from{opacity:0;transform:translate(-50%,-10px) scale(.96)}to{opacity:1;transform:translateX(-50%)}}
`;

// Missions without a pre-rendered thumbnail; World renders their previews while it prepares arenas.
export const RENDERED_PREVIEWS = Object.freeze({
  colon: { title: 'Colonic Reservoir', before: 'ear' },
  lymph: { title: 'Lymph Node', before: 'ear' },
});

function renameIds(root, from, to) {
  if (root.id) root.id = root.id.replace(from, to);
  for (const element of root.querySelectorAll('[id]')) element.id = element.id.replace(from, to);
  for (const element of root.querySelectorAll('[aria-labelledby]')) {
    element.setAttribute('aria-labelledby', element.getAttribute('aria-labelledby').replace(from, to));
  }
}

export function currentDifficulty() {
  return normalizeDifficulty(readSetting(DIFFICULTY_KEY));
}

// Solo missions pick up the menu's difficulty when they start. Co-op suits are driven by the server.
const startMission = Simulation.prototype.start;
Simulation.prototype.start = function start(...args) {
  if (!this.difficulty && !this.players) applyDifficulty(this, currentDifficulty());
  return startMission.apply(this, args);
};

// A compact Easy/Medium/Hard switch on the deployment screen. Hovering, focusing or choosing an
// option opens a card that lists exactly what that difficulty changes.
function installDifficultyPicker(document) {
  const mount = document.getElementById('deploy-difficulty') ?? document.querySelector('.menu-navigation');
  if (!mount || document.getElementById('difficulty-picker')) return;
  const picker = document.createElement('div');
  picker.id = 'difficulty-picker';
  picker.className = 'difficulty-picker';
  const label = document.createElement('span');
  label.id = 'difficulty-label';
  label.className = 'difficulty-label';
  label.textContent = 'Difficulty';
  const options = document.createElement('div');
  options.className = 'difficulty-options';
  options.setAttribute('role', 'radiogroup');
  options.setAttribute('aria-labelledby', label.id);
  const detail = document.createElement('div');
  detail.id = 'difficulty-detail';
  detail.className = 'difficulty-detail';
  let selected = currentDifficulty();
  let pointerType = '';

  const describe = id => {
    const level = DIFFICULTIES[id];
    detail.dataset.difficulty = id;
    const title = document.createElement('strong');
    title.textContent = level.name;
    const summary = document.createElement('p');
    summary.textContent = level.summary;
    const list = document.createElement('ul');
    for (const change of level.changes) {
      const item = document.createElement('li');
      item.textContent = change;
      list.append(item);
    }
    detail.replaceChildren(title, summary, list);
  };
  const buttons = Object.entries(DIFFICULTIES).map(([id, { name }]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.difficulty = id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-describedby', detail.id);
    button.textContent = name;
    return button;
  });
  const select = id => {
    selected = id;
    writeSetting(DIFFICULTY_KEY, id);
    for (const button of buttons) {
      const checked = button.dataset.difficulty === id;
      button.setAttribute('aria-checked', String(checked));
      button.tabIndex = checked ? 0 : -1;
    }
    describe(id);
  };
  for (const [index, button] of buttons.entries()) {
    const id = button.dataset.difficulty;
    button.addEventListener('pointerdown', event => { pointerType = event.pointerType; });
    button.addEventListener('click', () => {
      select(id);
      // Touch screens have no hover, so a tap keeps the card open until the next tap elsewhere.
      if (pointerType === 'touch' || pointerType === 'pen') picker.dataset.open = '';
      pointerType = '';
    });
    button.addEventListener('pointerenter', () => describe(id));
    button.addEventListener('focus', () => describe(id));
    button.addEventListener('pointerleave', () => describe(picker.contains(document.activeElement) ?
      document.activeElement.dataset.difficulty ?? selected : selected));
    button.addEventListener('keydown', event => {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = buttons[(index + step + buttons.length) % buttons.length];
      select(next.dataset.difficulty);
      next.focus();
    });
  }
  document.addEventListener('pointerdown', event => {
    if (!picker.contains(event.target)) delete picker.dataset.open;
  });
  options.append(...buttons);
  picker.append(label, options, detail);
  mount.append(picker);
  select(selected);
  // Each operator profile keeps its own difficulty.
  addEventListener('immune-protocol:profile', () => select(currentDifficulty()));
}

export function installLevelHud(document) {
  installDifficultyPicker(document);
  const summary = document.querySelector('.briefing .summary');
  if (summary) summary.textContent = 'Fight infection and repair living tissue across ten missions inside the host.';
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);

  const second = document.querySelector('[data-tissue-node="1"]');
  if (second && !document.querySelector('[data-tissue-node="2"]')) {
    const third = second.cloneNode(true);
    third.dataset.tissueNode = '2';
    third.hidden = true;
    renameIds(third, 'secondary', 'tertiary');
    third.querySelector('[data-node-name]').textContent = 'Tertiary';
    second.after(third);
  }
  // The Heart Valve defends four wounds, one in front of each valve.
  const thirdRow = document.querySelector('[data-tissue-node="2"]');
  if (thirdRow && !document.querySelector('[data-tissue-node="3"]')) {
    const fourth = thirdRow.cloneNode(true);
    fourth.dataset.tissueNode = '3';
    fourth.hidden = true;
    renameIds(fourth, 'tertiary', 'quaternary');
    fourth.querySelector('[data-node-name]').textContent = 'Quaternary';
    thirdRow.after(fourth);
  }

  const secondaryEdge = document.getElementById('secondary-edge');
  if (secondaryEdge && !document.getElementById('tertiary-marker')) {
    const marker = document.getElementById('secondary-marker').cloneNode(true);
    const edge = secondaryEdge.cloneNode(true);
    renameIds(marker, 'secondary', 'tertiary');
    renameIds(edge, 'secondary', 'tertiary');
    secondaryEdge.after(marker, edge);
  }
  const tertiaryEdge = document.getElementById('tertiary-edge');
  if (tertiaryEdge && !document.getElementById('quaternary-marker')) {
    const marker = document.getElementById('tertiary-marker').cloneNode(true);
    const edge = tertiaryEdge.cloneNode(true);
    renameIds(marker, 'tertiary', 'quaternary');
    renameIds(edge, 'tertiary', 'quaternary');
    tertiaryEdge.after(marker, edge);
  }

  const alert = document.getElementById('game-alert');
  if (alert && !document.getElementById('wave-outro')) {
    const outro = document.createElement('div');
    outro.id = 'wave-outro';
    outro.className = 'wave-outro';
    outro.setAttribute('role', 'status');
    outro.hidden = true;
    outro.innerHTML = '<span id="wave-outro-title">WAVE CLEARED</span><strong id="wave-outro-count">4</strong>' +
      '<small id="wave-outro-detail">Armory opens in</small><div class="wave-outro-bar"><div id="wave-outro-fill"></div></div>';
    alert.after(outro);
  }

  const template = document.getElementById('deploy-intestines')?.closest('li');
  for (const [area, { title, before }] of Object.entries(RENDERED_PREVIEWS)) {
    if (!template || document.getElementById('deploy-' + area)) continue;
    const item = template.cloneNode(true);
    const button = item.querySelector('button');
    button.id = 'deploy-' + area;
    button.dataset.deployArea = area;
    const image = item.querySelector('img');
    image.removeAttribute('src');
    image.dataset.previewArea = area;
    item.querySelector('.mission-card-title').textContent = title;
    document.getElementById('deploy-' + before).closest('li').before(item);
  }
  const preview = document.getElementById('mission-preview-detail');
  if (preview) preview.textContent = 'Defend the core, lateral branch and venous wall through five waves in the bloodstream.';
}

// Swaps in the previews World rendered for missions without a shipped thumbnail.
export function applyRenderedPreviews(document, previews) {
  for (const image of document.querySelectorAll('img[data-preview-area]')) {
    const source = previews?.[image.dataset.previewArea];
    if (!source) continue;
    image.src = source;
    image.hidden = false;
  }
}
