(async function startStudioIntro() {
  const intro = window.HallucinatedIntro;
  const dialog = document.getElementById('studio-intro');
  if (!intro || !dialog.showModal || new URLSearchParams(location.search).has('nointro')) return;

  const canvas = dialog.querySelector('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;

  let frame;
  let hold;
  dialog.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    cancelAnimationFrame(frame);
    clearTimeout(hold);
  }, { once: true });

  function draw(time) {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    intro.renderFrame(context, time, width, height);
  }

  try {
    dialog.showModal();
    await intro.ensureFonts();
    if (!dialog.open) return;

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw(3.6);
      hold = setTimeout(() => dialog.close(), 1600);
      return;
    }

    const start = performance.now();
    function animate(now) {
      if (!dialog.open) return;
      const elapsed = (now - start) / 1000;
      if (elapsed >= intro.DURATION) {
        dialog.close();
        return;
      }
      try {
        draw(elapsed);
        frame = requestAnimationFrame(animate);
      } catch {
        dialog.close();
      }
    }
    frame = requestAnimationFrame(animate);
  } catch {
    dialog.close();
  }
})();
