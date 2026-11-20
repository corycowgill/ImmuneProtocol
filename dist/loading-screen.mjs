const byId = id => document.getElementById(id);
export const paintLoading = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
const quotes = [
  'Please keep all arms and legs inside the bloodstream.',
  'You are now smaller than the fine print in your insurance policy.',
  'The host has 37 trillion cells. Try to leave most of them intact.',
  'Friendly reminder: the bacteria did not book this appointment.',
  'Loading tiny weapons. They still count as carry-on luggage.',
  'Your mission is internal. Your screaming can be external.',
  'Do not feed the pathogens. Especially after mitosis.',
  'The immune system called for backup. Apparently, that is you.',
  'If you can read this, the miniaturizer has not hit your glasses yet.',
  'Please wash your hands before entering the hands.',
  'Warning: the stomach does not validate parking.',
  'Tiny soldier. Full-sized attitude problem.',
];
let quote = Math.floor(Math.random() * quotes.length);
let rotation;
let percent = 0;
export const loadingScreen = {
  begin(title = 'Small soldier. Big problems.', detail = 'Preparing your microscopic arsenal and the world inside the host.', mode = 'SYSTEM INITIALIZATION') {
    clearInterval(rotation);
    const screen = byId('startup-load');
    screen.hidden = false;
    screen.setAttribute('aria-busy', 'true');
    byId('app').inert = true;
    // The default two-line heading is authored in HTML; mission names stay plain text.
    if (mode !== 'SYSTEM INITIALIZATION') byId('loading-title').textContent = title;
    byId('loading-detail').textContent = detail;
    byId('loading-mode').textContent = mode;
    byId('startup-retry').hidden = true;
    byId('startup-progress').hidden = byId('startup-percent').hidden = false;
    percent = 0;
    this.progress(0, 'Checking the injection manifest');
    const changeQuote = () => { byId('loading-quote').textContent = quotes[quote++ % quotes.length]; };
    changeQuote();
    rotation = setInterval(changeQuote, 6500);
  },
  progress(value, status) {
    percent = Math.max(percent, Math.min(100, Math.round(value)));
    byId('startup-progress').value = percent;
    byId('startup-percent').textContent = percent + '%';
    if (status) byId('startup-status').textContent = status;
    const thresholds = [15, 75, 95, 100];
    document.querySelectorAll('.loading-stages li').forEach((stage, i) => stage.toggleAttribute('data-complete', percent >= thresholds[i]));
  },
  async finish() {
    this.progress(100, 'All systems ready. Stay microscopic.');
    await paintLoading();
    clearInterval(rotation);
    byId('startup-load').hidden = true;
    byId('startup-load').setAttribute('aria-busy', 'false');
    byId('app').inert = false;
  },
  fail(message) {
    clearInterval(rotation);
    byId('startup-status').textContent = message;
    byId('startup-load').setAttribute('aria-busy', 'false');
    byId('startup-retry').hidden = false;
    byId('startup-retry').onclick = () => location.reload();
    byId('startup-retry').focus();
  },
};
