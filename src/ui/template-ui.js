import { defaultTemplate, createTemplate, GRAPH_TYPES } from '../graph/template.js';
import { showToast } from './toast.js';

const TEMPLATES_KEY = 'graph-merge-templates';

/** Load all global templates from localStorage */
export function loadGlobalTemplates() {
  try {
    const stored = JSON.parse(localStorage.getItem(TEMPLATES_KEY));
    if (stored && typeof stored === 'object') {
      // Always ensure Default exists
      if (!stored['Default']) stored['Default'] = defaultTemplate();
      return stored;
    }
  } catch { /* ignore */ }
  return { Default: defaultTemplate() };
}

/** Save global templates to localStorage */
function saveGlobalTemplates(templates) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

/** Append " (2)", " (3)", ... until name is unique */
export function uniqueName(baseName, existingNames) {
  if (!existingNames.includes(baseName)) return baseName;
  let i = 2;
  while (existingNames.includes(`${baseName} (${i})`)) i++;
  return `${baseName} (${i})`;
}

let _onTemplateSelect = null;

/** Render global template controls into #template-controls */
export function setupTemplateUI(onTemplateSelect) {
  _onTemplateSelect = onTemplateSelect;
  renderTemplateControls();
}

function renderTemplateControls() {
  const container = document.getElementById('template-controls');
  if (!container) return;

  const templates = loadGlobalTemplates();
  const names = Object.keys(templates);

  const options = names.map(n => `<option value="${n}">${n}</option>`).join('');

  container.innerHTML = `
    <select id="template-select">${options}</select>
    <div class="session-menu-wrapper">
      <button id="template-menu-toggle" class="btn-icon" title="Template actions">&#x2630;</button>
      <div id="template-menu" class="session-dropdown" hidden>
        <button id="template-new">New</button>
        <button id="template-rename">Rename</button>
        <button id="template-delete">Delete</button>
        <button id="template-export">Export</button>
        <button id="template-import">Import</button>
      </div>
    </div>
  `;

  const menu = container.querySelector('#template-menu');
  const menuToggle = container.querySelector('#template-menu-toggle');
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
    container.querySelector(id).onclick = () => { closeMenu(); fn(); };
  };

  container.querySelector('#template-select').onchange = e => {
    const name = e.target.value;
    const t = loadGlobalTemplates()[name];
    if (t && _onTemplateSelect) _onTemplateSelect(JSON.parse(JSON.stringify(t)));
  };

  wrapAction('#template-new', createNewTemplate);
  wrapAction('#template-rename', renameTemplate);
  wrapAction('#template-delete', deleteTemplate);
  wrapAction('#template-export', exportTemplate);
  wrapAction('#template-import', importTemplate);
}

function createNewTemplate() {
  const name = prompt('Template name:');
  if (!name?.trim()) return;

  const typeKeys = Object.keys(GRAPH_TYPES);
  const typeChoice = prompt(
    `Graph type:\n${typeKeys.map((k, i) => `${i + 1}. ${k} — ${GRAPH_TYPES[k].label}`).join('\n')}\nEnter number:`,
    '1'
  );
  const idx = parseInt(typeChoice) - 1;
  const graphType = typeKeys[idx] || 'UCG';

  const templates = loadGlobalTemplates();
  const finalName = uniqueName(name.trim(), Object.keys(templates));
  templates[finalName] = createTemplate(finalName, graphType);
  saveGlobalTemplates(templates);
  renderTemplateControls();
  showToast(`Created template "${finalName}"`, 'success');
}

function renameTemplate() {
  const select = document.getElementById('template-select');
  const currentName = select?.value;
  if (currentName === 'Default') {
    showToast('Cannot rename the Default template', 'info');
    return;
  }
  const newName = prompt('New template name:', currentName);
  if (!newName?.trim() || newName.trim() === currentName) return;
  const templates = loadGlobalTemplates();
  templates[newName.trim()] = { ...templates[currentName], name: newName.trim() };
  delete templates[currentName];
  saveGlobalTemplates(templates);
  renderTemplateControls();
  showToast(`Renamed to "${newName.trim()}"`, 'success');
}

function deleteTemplate() {
  const select = document.getElementById('template-select');
  const name = select?.value;
  if (name === 'Default') {
    showToast('Cannot delete the Default template', 'info');
    return;
  }
  if (!confirm(`Delete template "${name}"?`)) return;
  const templates = loadGlobalTemplates();
  delete templates[name];
  saveGlobalTemplates(templates);
  renderTemplateControls();
  showToast(`Deleted template "${name}"`, 'info');
}

function exportTemplate() {
  const select = document.getElementById('template-select');
  const name = select?.value;
  const templates = loadGlobalTemplates();
  const template = templates[name];
  if (!template) return;
  const data = JSON.stringify({ version: 1, template }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `template-${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported template "${name}"`, 'success');
}

function importTemplate() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      let data;
      try { data = JSON.parse(e.target.result); } catch {
        showToast('Invalid JSON file', 'error');
        return;
      }
      if (!data.template || !data.template.name) {
        showToast('Invalid template file', 'error');
        return;
      }
      const templates = loadGlobalTemplates();
      const importedName = uniqueName(data.template.name, Object.keys(templates));
      templates[importedName] = { ...data.template, name: importedName };
      saveGlobalTemplates(templates);
      renderTemplateControls();
      showToast(`Imported template "${importedName}"`, 'success');
    };
    reader.readAsText(file);
  };
  input.click();
}

/** Get the currently selected global template name */
export function getSelectedTemplateName() {
  return document.getElementById('template-select')?.value || 'Default';
}
