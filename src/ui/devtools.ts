// Developer tools hooks for renderer
// - Wires the dev-perf checkbox to IPC
// - Displays perf metrics in the dev panel

export function initDevTools(ipcRenderer: Electron.IpcRenderer) {
  const devPerfEl = document.getElementById('dev-perf') as HTMLInputElement | null;
  if (devPerfEl) {
    devPerfEl.addEventListener('change', () => {
      ipcRenderer.send('dev-perf', devPerfEl.checked);
    });
  }

  ipcRenderer.on('perf', (_e, data) => {
    const out = document.getElementById('perf-out');
    if (out) out.textContent = JSON.stringify(data, null, 2);
  });
}
