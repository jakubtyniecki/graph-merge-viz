/** Status bar for showing storage usage and session stats */

let statusBarEl = null;

/** Get localStorage usage in bytes */
function getLocalStorageUsage() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    // UTF-16 encoding: 2 bytes per character
    total += (key.length + value.length) * 2;
  }
  return total;
}

/** Format bytes to human-readable size */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Get aggregated session stats from localStorage */
function getSessionStats() {
  const sessionsJson = localStorage.getItem('graph-merge-sessions');
  if (!sessionsJson) return null;

  try {
    const sessions = JSON.parse(sessionsJson);
    let totalNodes = 0;
    let totalEdges = 0;
    let totalPanels = 0;
    let latestSavedAt = null;

    for (const [sessionId, sessionData] of Object.entries(sessions)) {
      if (!sessionData.panels) continue;

      for (const [panelId, panelState] of Object.entries(sessionData.panels)) {
        totalPanels++;
        if (panelState.graph) {
          totalNodes += panelState.graph.nodes?.length || 0;
          totalEdges += panelState.graph.edges?.length || 0;
        }
      }

      if (sessionData.savedAt) {
        if (!latestSavedAt || new Date(sessionData.savedAt) > new Date(latestSavedAt)) {
          latestSavedAt = sessionData.savedAt;
        }
      }
    }

    return {
      sessionCount: Object.keys(sessions).length,
      totalNodes,
      totalEdges,
      totalPanels,
      latestSavedAt,
    };
  } catch (err) {
    console.error('Failed to parse session stats:', err);
    return null;
  }
}

/** Update status bar content */
export function updateStatusBar() {
  if (!statusBarEl) return;

  const leftEl = statusBarEl.querySelector('.status-left');
  const rightEl = statusBarEl.querySelector('.status-right');

  const usage = getLocalStorageUsage();
  const stats = getSessionStats();

  // Left side: storage + session stats
  let leftContent = `Storage: ${formatBytes(usage)}`;
  if (stats) {
    leftContent += ` | ${stats.totalNodes}n ${stats.totalEdges}e ${stats.totalPanels}p ${stats.sessionCount}s`;
  }
  leftEl.textContent = leftContent;

  // Right side: last saved time
  if (stats && stats.latestSavedAt) {
    const time = new Date(stats.latestSavedAt).toLocaleTimeString();
    rightEl.textContent = `Last: ${time}`;
  } else {
    rightEl.textContent = '';
  }
}

/** Initialize status bar */
export function setupStatusBar() {
  statusBarEl = document.getElementById('status-bar');
  if (!statusBarEl) {
    console.warn('Status bar element not found');
    return;
  }

  // Listen to panel changes for auto-update
  window.addEventListener('panel-change', updateStatusBar);

  // Initial render
  updateStatusBar();
}
