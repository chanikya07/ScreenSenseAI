// Shared window state utilities for renderer windows.

function setupWindowMaximizeHandler(bodySelector) {
  window.ss.on('window:maximized-state', (isMaximized) => {
    const target = bodySelector
      ? document.querySelector(bodySelector)
      : document.body;
    if (target) target.classList.toggle('maximized', isMaximized);
    const btn = document.getElementById('maximizeBtn');
    if (!btn) return;
    btn.textContent = isMaximized ? '\u2750' : '\u25A1';
    btn.title = isMaximized ? 'Restore' : 'Maximize';
  });
}
