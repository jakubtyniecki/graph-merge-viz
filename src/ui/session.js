import { showToast } from './toast.js';
import { updateStatusBar } from './status-bar.js';

const STORAGE_KEY = 'graph-merge-sessions';
const ACTIVE_KEY = 'graph-merge-active-session';

let _panels = null;
let _layoutManager = null;
let _saveTimeout = null;

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function getActiveSessionName() {
  return localStorage.getItem(ACTIVE_KEY) || 'Default';
}

function setActiveSessionName(name) {
  localStorage.setItem(ACTIVE_KEY, name);
}

/** Migrate old format (state with X.Y keys) to new layout-based format */
function migrateOldSession(session) {
  if (!session.state) return session;
  if (session.layout) return session;

  // Old format: { state: { "1.1": PanelState, "1.2": ..., "2.1": ..., "3.1": ... } }
  // New format: { layout: { tree, nextId }, panels: { "1": PanelState, ... } }
  const oldIds = Object.keys(session.state);
  const panels = {};
  let nextId = 1;

  // Map first two old panels to new panel IDs 1 and 2
  const mapping = {};
  for (const oldId of oldIds.slice(0, 2)) {
    const newId = String(nextId++);
    mapping[oldId] = newId;
    const s = session.state[oldId];
    panels[newId] = { ...s, id: newId };
  }

  return {
    layout: {
      tree: {
        type: 'split',
        direction: 'v',
        children: [
          { type: 'panel', id: '1' },
          { type: 'panel', id: '2' },
        ],
        sizes: [50, 50],
      },
      nextId,
    },
    panels,
    savedAt: session.savedAt,
  };
}

function saveCurrentSession() {
  if (!_panels || !_layoutManager) return;
  const name = getActiveSessionName();
  const sessions = loadSessions();
  const panelStates = {};
  for (const [id, panel] of _panels) {
    panelStates[id] = panel.getState();
  }
  sessions[name] = {
    layout: _layoutManager.getLayout(),
    panels: panelStates,
    layoutAlgorithm: window.__layoutAlgorithm || 'fcose',
    savedAt: new Date().toISOString(),
  };
  saveSessions(sessions);
}

function restoreSession(name) {
  if (!_panels || !_layoutManager) return;
  const sessions = loadSessions();
  let session = sessions[name];
  if (!session) return;

  // Migrate old format if needed
  session = migrateOldSession(session);
  sessions[name] = session;
  saveSessions(sessions);

  // Restore layout algorithm
  if (session.layoutAlgorithm) {
    window.__layoutAlgorithm = session.layoutAlgorithm;
    const select = document.getElementById('layout-algo');
    if (select) select.value = session.layoutAlgorithm;
  }

  // Restore layout (this destroys old panels and creates new ones)
  if (session.layout) {
    _layoutManager.setLayout(session.layout);
  }

  // Restore panel states
  if (session.panels) {
    for (const [id, panel] of _panels) {
      if (session.panels[id]) {
        panel.setState(session.panels[id]);
      }
    }
  }

  setActiveSessionName(name);
  updateStatusBar();
}

function debouncedSave() {
  clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(saveCurrentSession, 2000);
}

function renderSessionControls() {
  const container = document.getElementById('session-controls');
  if (!container) return;

  const sessions = loadSessions();
  const active = getActiveSessionName();
  const names = Object.keys(sessions);
  if (!names.includes(active)) names.unshift(active);

  const options = names.map(n =>
    `<option value="${n}" ${n === active ? 'selected' : ''}>${n}</option>`
  ).join('');

  container.innerHTML = `
    <select id="session-select">${options}</select>
    <button id="session-new" title="New session">New</button>
    <button id="session-rename" title="Rename session">Rename</button>
    <button id="session-delete" title="Delete session">Delete</button>
    <button class="help-btn" id="help-btn" title="Keyboard shortcuts">?</button>
  `;

  container.querySelector('#session-select').onchange = e => {
    saveCurrentSession();
    restoreSession(e.target.value);
    showToast(`Switched to "${e.target.value}"`, 'info');
    updateStatusBar();
  };

  container.querySelector('#session-new').onclick = () => {
    const name = prompt('Session name:');
    if (!name || !name.trim()) return;
    saveCurrentSession();
    // Re-init layout with fresh 2 panels
    _layoutManager.init();
    setActiveSessionName(name.trim());
    saveCurrentSession();
    renderSessionControls();
    showToast(`Created session "${name.trim()}"`, 'success');
    updateStatusBar();
  };

  container.querySelector('#session-rename').onclick = () => {
    const oldName = getActiveSessionName();
    const newName = prompt('New name:', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const sessions = loadSessions();
    sessions[newName.trim()] = sessions[oldName];
    delete sessions[oldName];
    saveSessions(sessions);
    setActiveSessionName(newName.trim());
    renderSessionControls();
    showToast(`Renamed to "${newName.trim()}"`, 'success');
  };

  container.querySelector('#session-delete').onclick = () => {
    const name = getActiveSessionName();
    if (!confirm(`Delete session "${name}"?`)) return;
    const sessions = loadSessions();
    delete sessions[name];
    saveSessions(sessions);
    const remaining = Object.keys(sessions);
    if (remaining.length > 0) {
      restoreSession(remaining[0]);
    } else {
      setActiveSessionName('Default');
      _layoutManager.init();
    }
    renderSessionControls();
    showToast(`Deleted session "${name}"`, 'info');
    updateStatusBar();
  };

  container.querySelector('#help-btn').onclick = () => {
    toggleHelp();
  };
}

function toggleHelp() {
  let help = document.querySelector('.keyboard-help');
  if (!help) {
    help = document.createElement('div');
    help.className = 'keyboard-help';
    help.innerHTML = `
      <h3>Keyboard Shortcuts</h3>
      <dl>
        <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd>Undo</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></dt><dd>Redo</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>C</kbd></dt><dd>Copy selected subgraph</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>V</kbd></dt><dd>Paste into focused panel</dd>
        <dt><kbd>Delete</kbd></dt><dd>Delete selected elements</dd>
        <dt><kbd>Escape</kbd></dt><dd>Deselect all / close dialog</dd>
      </dl>
      <div class="dialog-actions" style="margin-top:12px">
        <button onclick="this.closest('.keyboard-help').classList.remove('visible')">Close</button>
      </div>
    `;
    document.body.appendChild(help);
  }
  help.classList.toggle('visible');
}

export function setupSession(panels, layoutManager) {
  _panels = panels;
  _layoutManager = layoutManager;

  // Listen for panel changes → debounced save
  window.addEventListener('panel-change', debouncedSave);

  // Restore active session on load
  const active = getActiveSessionName();
  const sessions = loadSessions();
  if (sessions[active]) {
    restoreSession(active);
  } else {
    // Ensure the default session exists
    saveCurrentSession();
  }

  renderSessionControls();
}
