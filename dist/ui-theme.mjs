// Shared by layout, painting and alternate hosts. Fonts are bundled with the game.
export const UI_THEME = Object.freeze({
  paper: '#edf2f2', muted: '#a8b7bf', faint: '#70848e', green: '#c8f794',
  hot: '#ff957e', teal: '#8fe4dd', panel: '#111a20f2', line: '#a4c1cc28',
  base: '#080e13', raised: '#1a272f', selected: '#26382d',
});
export const UI_FONTS = Object.freeze({
  body: '"Inter", "Segoe UI", sans-serif',
  display: '"Barlow Condensed", "Arial Narrow", sans-serif',
  mono: '"IBM Plex Mono", monospace',
});
export const uiLineHeight = node => node.lineHeight ?? (node.kind === 'heading' ? 1.04 : 1.4);
export const uiWeight = node => node.weight ?? (node.kind === 'heading' ? 800 : node.kind === 'button' ? 600 : 500);
export const uiFace = (weight, face) => UI_FONTS[face] ?? (weight >= 800 ? UI_FONTS.display : UI_FONTS.body);
