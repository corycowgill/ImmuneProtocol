// Waits, without blocking the main thread, until the GPU has finished everything queued so far.
// Synchronous WebGL calls that need a GPU round trip (texture uploads, readPixels, drawImage of
// the WebGL canvas, program link queries) otherwise stall the page until all earlier work is
// done. Preparation awaits this before such calls so each one only waits for its own work.
export async function gpuIdle(renderer, nextTask = () => new Promise(resolve => setTimeout(resolve, 0))) {
  const gl = renderer.getContext();
  if (!gl.fenceSync) return;
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) throw new Error('The graphics context could not finish preparation');
  gl.flush();
  try {
    let result;
    do {
      await nextTask();
      result = gl.clientWaitSync(fence, 0, 0);
      if (result === gl.WAIT_FAILED || gl.isContextLost()) throw new Error('Graphics preparation was interrupted');
    } while (result === gl.TIMEOUT_EXPIRED);
  } finally {
    gl.deleteSync(fence);
  }
}
