// HUD and menu pieces for the expanded campaign: the third tissue-node readout and marker, the
// wave-clear countdown banner, and Free Mode cards for the Colonic Reservoir and Lymph Node.

const STYLE = `
.node-row[data-tissue-node="2"]{--node-color:#e7b4ff}
#tertiary-marker,#tertiary-edge{color:#e7b4ff}
#tertiary-edge{border-color:#e7b4ff80}
#tertiary-marker.under-attack,#tertiary-edge.under-attack{color:#ffbd92}
#tertiary-marker.critical,#tertiary-edge.critical{color:#ff8a73}
#tertiary-edge:is(.under-attack,.critical){border-color:currentColor}
.wave-outro{position:absolute;left:50%;top:27%;transform:translateX(-50%);display:grid;justify-items:center;gap:4px;padding:12px 26px 14px;min-width:220px;border:1px solid #c8f79459;background:linear-gradient(180deg,#141a13d9,#0d100cc2);color:var(--green);text-align:center;pointer-events:none;box-shadow:0 0 28px #9bf4c41f;animation:outro-in .35s ease-out}
.wave-outro[hidden]{display:none}
.wave-outro span{font:800 clamp(16px,2vw,24px)/1 var(--display);letter-spacing:.14em}
.wave-outro strong{font:800 clamp(38px,5.4vw,70px)/1 var(--display);color:#f3ffd9;text-shadow:0 0 22px #9bf4c466}
.wave-outro small{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#e9e5bf}
.wave-outro-bar{width:100%;height:3px;background:#ffffff1f;margin-top:4px}
.wave-outro-bar div{height:100%;width:100%;background:var(--green);transform-origin:left;transition:transform .1s linear}
.wave-outro[data-final="true"]{border-color:#ffd58a80;color:#ffd58a}
.wave-outro[data-final="true"] .wave-outro-bar div{background:#ffd58a}
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

export function installLevelHud(document) {
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

  const secondaryEdge = document.getElementById('secondary-edge');
  if (secondaryEdge && !document.getElementById('tertiary-marker')) {
    const marker = document.getElementById('secondary-marker').cloneNode(true);
    const edge = secondaryEdge.cloneNode(true);
    renameIds(marker, 'secondary', 'tertiary');
    renameIds(edge, 'secondary', 'tertiary');
    secondaryEdge.after(marker, edge);
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
