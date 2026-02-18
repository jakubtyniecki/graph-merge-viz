import { showToast } from './toast.js';
import { updateStatusBar } from './status-bar.js';
import { editTemplateDialog, newSessionDialog } from './dialogs.js';
import { loadGlobalTemplates, uniqueName } from './template-ui.js';
import { defaultTemplate } from '../graph/template.js';

const STORAGE_KEY = 'graph-merge-sessions';
const ACTIVE_KEY = 'graph-merge-active-session';

let _panels = null;
let _layoutManager = null;
let _saveTimeout = null;
let _currentTemplate = defaultTemplate();
let _onTemplateChange = null;

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

  const oldIds = Object.keys(session.state);
  const panels = {};
  let nextId = 1;

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
    // Old sessions get DG to preserve directed arrows
    template: { name: 'Default', graphType: 'DG', nodeTypes: [], edgeTypes: [] },
    savedAt: session.savedAt,
  };
}

/** Migrate sessions missing template field */
function migrateTemplate(session) {
  if (!session.template) {
    return { ...session, template: { name: 'Default', graphType: 'DG', nodeTypes: [], edgeTypes: [] } };
  }
  return session;
}

export function getSessionTemplate() {
  return _currentTemplate;
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
    template: _currentTemplate,
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

  // Migrate formats
  session = migrateOldSession(session);
  session = migrateTemplate(session);
  sessions[name] = session;
  saveSessions(sessions);

  // Restore layout algorithm
  if (session.layoutAlgorithm) {
    window.__layoutAlgorithm = session.layoutAlgorithm;
    const select = document.getElementById('layout-algo');
    if (select) select.value = session.layoutAlgorithm;
  }

  // Restore template
  _currentTemplate = session.template || defaultTemplate();
  if (_onTemplateChange) _onTemplateChange(_currentTemplate);

  // Restore layout (destroys old panels and creates new ones)
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
    <div class="session-menu-wrapper">
      <button id="session-menu-toggle" class="btn-icon" title="Session actions">&#x2630;</button>
      <div id="session-menu" class="session-dropdown" hidden>
        <button id="session-new">New</button>
        <button id="session-rename">Rename</button>
        <button id="session-delete">Delete</button>
        <hr class="menu-divider">
        <button id="session-edit-template">Edit Template</button>
        <hr class="menu-divider">
        <button id="session-export">Export</button>
        <button id="session-import">Import</button>
      </div>
    </div>
    <button class="help-btn" id="help-btn" title="Keyboard shortcuts">?</button>
  `;

  const menu = container.querySelector('#session-menu');
  const menuToggle = container.querySelector('#session-menu-toggle');

  const closeMenu = () => menu.hidden = true;

  menuToggle.onclick = e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };

  const onDocClick = e => {
    if (!container.contains(e.target)) closeMenu();
  };
  document.addEventListener('click', onDocClick);
  const observer = new MutationObserver(() => {
    if (!document.contains(menuToggle)) {
      document.removeEventListener('click', onDocClick);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const wrapAction = (id, fn) => {
    const el = container.querySelector(id);
    if (el) el.onclick = () => { closeMenu(); fn(); };
  };

  container.querySelector('#session-select').onchange = e => {
    saveCurrentSession();
    restoreSession(e.target.value);
    showToast(`Switched to "${e.target.value}"`, 'info');
    updateStatusBar();
  };

  wrapAction('#session-new', async () => {
    const globalTemplates = loadGlobalTemplates();
    const result = await newSessionDialog(globalTemplates);
    if (!result) return;
    const { name, templateName } = result;
    const chosenTemplate = JSON.parse(JSON.stringify(globalTemplates[templateName] || defaultTemplate()));

    saveCurrentSession();
    _currentTemplate = chosenTemplate;
    if (_onTemplateChange) _onTemplateChange(_currentTemplate);
    _layoutManager.init();
    setActiveSessionName(name.trim());
    saveCurrentSession();
    renderSessionControls();
    showToast(`Created session "${name.trim()}"`, 'success');
    updateStatusBar();
  });

  wrapAction('#session-rename', () => {
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
  });

  wrapAction('#session-delete', () => {
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
  });

  wrapAction('#session-edit-template', () => {
    editTemplateDialog(_currentTemplate, (newTemplate) => {
      _currentTemplate = newTemplate;
      if (_onTemplateChange) _onTemplateChange(_currentTemplate);
      debouncedSave();
      showToast('Template updated', 'success');
    });
  });

  wrapAction('#session-export', exportSession);
  wrapAction('#session-import', importSession);

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

/** Export current session as a JSON file download */
function exportSession() {
  saveCurrentSession();
  const name = getActiveSessionName();
  const sessions = loadSessions();
  const session = sessions[name];
  if (!session) {
    showToast('No session to export', 'error');
    return;
  }

  const data = JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), sessionName: name, ...session }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  a.download = `session-${safeName}-${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported session "${name}"`, 'success');
}

/** Import a session from a JSON file */
function importSession() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch {
        showToast('Invalid JSON file', 'error');
        return;
      }

      if (!data.layout || !data.panels) {
        showToast('Invalid session file: missing layout or panels', 'error');
        return;
      }

      // Determine unique session name
      const sessions = loadSessions();
      const defaultName = data.sessionName || 'Imported';
      const rawName = prompt('Session name for imported session:', uniqueName(defaultName, Object.keys(sessions)));
      if (!rawName || !rawName.trim()) return;
      const importedName = rawName.trim();

      sessions[importedName] = {
        layout: data.layout,
        panels: data.panels,
        template: data.template || { name: 'Default', graphType: 'DG', nodeTypes: [], edgeTypes: [] },
        layoutAlgorithm: data.layoutAlgorithm,
        savedAt: data.savedAt || new Date().toISOString(),
      };
      saveSessions(sessions);

      saveCurrentSession();
      restoreSession(importedName);
      renderSessionControls();
      showToast(`Imported session "${importedName}"`, 'success');
      updateStatusBar();
    };
    reader.readAsText(file);
  };
  input.click();
}

export function setupSession(panels, layoutManager, onTemplateChange) {
  _panels = panels;
  _layoutManager = layoutManager;
  _onTemplateChange = onTemplateChange;

  window.addEventListener('panel-change', debouncedSave);

  const active = getActiveSessionName();
  const sessions = loadSessions();
  if (sessions[active]) {
    restoreSession(active);
  } else {
    saveCurrentSession();
  }

  renderSessionControls();
}
