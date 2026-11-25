// Shared by layout, painting and alternate hosts. Fonts are bundled with the game.
export const UI_THEME = Object.freeze({
  paper: '#edf2f2', muted: '#a8b7bf', faint: '#70848e', green: '#c8f794',
  hot: '#ff957e', teal: '#8fe4dd', panel: '#111a20f2', line: '#a4c1cc28',
  base: '#080e13', raised: '#1a272f', selected: '#26382d',
});
// The bundled faces cover Latin script. Chinese and Hindi fall through to the system's own fonts
// for those scripts, listed after them (each glyph uses the first font that has it).
const SCRIPTS = '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", ' +
  '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Source Han Sans TC", "WenQuanYi Zen Hei", ' +
  '"Noto Sans Devanagari", "Nirmala UI", "Kohinoor Devanagari", "Devanagari Sangam MN", "Mangal"';
export const UI_FONTS = Object.freeze({
  body: '"Inter", "Segoe UI", ' + SCRIPTS + ', sans-serif',
  display: '"Barlow Condensed", "Arial Narrow", ' + SCRIPTS + ', sans-serif',
  mono: '"IBM Plex Mono", ' + SCRIPTS + ', monospace',
});
export const uiLineHeight = node => node.lineHeight ?? (node.kind === 'heading' ? 1.04 : 1.4);
export const uiWeight = node => node.weight ?? (node.kind === 'heading' ? 800 : node.kind === 'button' ? 600 : 500);
export const uiFace = (weight, face) => UI_FONTS[face] ?? (weight >= 800 ? UI_FONTS.display : UI_FONTS.body);
