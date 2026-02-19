import { defaultTemplate, createTemplate, GRAPH_TYPES } from '../graph/template.js';
import { showToast } from './toast.js';
import { openDialog, closeDialog, editTemplateDialog } from './dialogs.js';

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

/** Setup template UI — no-op, Templates button is now in session controls */
export function setupTemplateUI() {}

function templateMeta(template) {
  const graphLabel = GRAPH_TYPES[template.graphType]?.label || template.graphType;
  const nodeCount = template.nodeTypes?.length || 0;
  const edgeCount = template.edgeTypes?.length || 0;
  return `${graphLabel} · ${nodeCount} node type${nodeCount !== 1 ? 's' : ''} · ${edgeCount} edge type${edgeCount !== 1 ? 's' : ''}`;
}

export function templateManagementModal() {
  let selectedName = null;

  const renderList = (templates) => {
    const names = Object.keys(templates);
    if (names.length === 0) return '<p style="color:var(--text-muted);padding:12px;text-align:center">No templates</p>';
    return names.map(name => {
      const t = templates[name];
      const isSelected = name === selectedName;
      return `
        <div class="template-list-item ${isSelected ? 'selected' : ''}" data-name="${name}">
          <span class="tpl-name">${name}</span>
          <span class="tpl-meta">${templateMeta(t)}</span>
        </div>
      `;
    }).join('');
  };

  const buildHtml = (templates) => `
    <div class="dialog-header">
      <h3>Templates</h3>
      <button id="dlg-close-x" class="btn-close-icon" title="Close">&#x2715;</button>
    </div>
    <div class="template-list" id="tpl-list">
      ${renderList(templates)}
    </div>
    <div class="template-modal-footer">
      <button id="tpl-add">Add</button>
      <button id="tpl-remove">Remove</button>
      <button id="tpl-edit">Edit</button>
      <button id="tpl-copy">Copy</button>
      <button id="tpl-import">Import</button>
      <button id="tpl-export">Export</button>
    </div>
  `;

  const templates = loadGlobalTemplates();
  const dlg = openDialog(buildHtml(templates));
  dlg.classList.add('dialog-wide');

  const rerender = () => {
    const current = loadGlobalTemplates();
    dlg.querySelector('#tpl-list').innerHTML = renderList(current);
    wireListClicks();
  };

  const wireListClicks = () => {
    dlg.querySelectorAll('.template-list-item').forEach(item => {
      item.onclick = () => {
        selectedName = item.dataset.name;
        rerender();
      };
    });
  };

  wireListClicks();

  // Event delegation for close button — survives any inner content rerenders
  dlg.addEventListener('click', e => {
    if (e.target.matches('#dlg-close-x')) closeDialog();
  });

  dlg.querySelector('#tpl-add').onclick = () => {
    const graphTypeOptions = Object.entries(GRAPH_TYPES)
      .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
      .join('');

    // Replace list with inline add form
    dlg.querySelector('#tpl-list').innerHTML = `
      <div style="padding:12px;display:flex;flex-direction:column;gap:8px">
        <label>Template Name</label>
        <input id="tpl-new-name" type="text" placeholder="Template name" autofocus>
        <label>Graph Type</label>
        <select id="tpl-graph-type">${graphTypeOptions}</select>
        <div style="display:flex;gap:8px;margin-top:4px">
          <button id="tpl-create-confirm" class="btn-primary">Create</button>
          <button id="tpl-create-cancel">Cancel</button>
        </div>
      </div>
    `;
    dlg.querySelector('#tpl-new-name').focus();

    dlg.querySelector('#tpl-create-cancel').onclick = rerender;
    dlg.querySelector('#tpl-create-confirm').onclick = () => {
      const name = dlg.querySelector('#tpl-new-name').value.trim();
      if (!name) { showToast('Template name required', 'error'); return; }
      const graphType = dlg.querySelector('#tpl-graph-type').value;
      const allTemplates = loadGlobalTemplates();
      const finalName = uniqueName(name, Object.keys(allTemplates));
      allTemplates[finalName] = createTemplate(finalName, graphType);
      saveGlobalTemplates(allTemplates);
      selectedName = finalName;
      showToast(`Created template "${finalName}"`, 'success');
      rerender();
    };
  };

  dlg.querySelector('#tpl-remove').onclick = () => {
    if (!selectedName) { showToast('Select a template first', 'info'); return; }
    if (selectedName === 'Default') { showToast('Cannot remove the Default template', 'info'); return; }
    const allTemplates = loadGlobalTemplates();
    const nameToRemove = selectedName;
    if (!confirm(`Delete template "${nameToRemove}"?`)) return;
    delete allTemplates[nameToRemove];
    saveGlobalTemplates(allTemplates);
    selectedName = null;
    showToast(`Deleted template "${nameToRemove}"`, 'info');
    rerender();
  };

  dlg.querySelector('#tpl-edit').onclick = () => {
    if (!selectedName) { showToast('Select a template first', 'info'); return; }
    const allTemplates = loadGlobalTemplates();
    const template = allTemplates[selectedName];
    if (!template) return;
    closeDialog();
    const capturedName = selectedName;
    editTemplateDialog(JSON.parse(JSON.stringify(template)), (updated) => {
      const latest = loadGlobalTemplates();
      latest[capturedName] = updated;
      saveGlobalTemplates(latest);
      showToast('Template updated', 'success');
      templateManagementModal(); // Return to list after save
    }, false, () => templateManagementModal()); // onBack: return to list
  };

  dlg.querySelector('#tpl-copy').onclick = () => {
    if (!selectedName) { showToast('Select a template first', 'info'); return; }
    const allTemplates = loadGlobalTemplates();
    const src = allTemplates[selectedName];
    if (!src) return;
    const copyName = uniqueName(selectedName + ' Copy', Object.keys(allTemplates));
    allTemplates[copyName] = { ...JSON.parse(JSON.stringify(src)), name: copyName };
    saveGlobalTemplates(allTemplates);
    selectedName = copyName;
    showToast(`Copied as "${copyName}"`, 'success');
    rerender();
  };

  dlg.querySelector('#tpl-import').onclick = () => {
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
        const allTemplates = loadGlobalTemplates();
        const importedName = uniqueName(data.template.name, Object.keys(allTemplates));
        allTemplates[importedName] = { ...data.template, name: importedName };
        saveGlobalTemplates(allTemplates);
        selectedName = importedName;
        showToast(`Imported template "${importedName}"`, 'success');
        rerender();
      };
      reader.readAsText(file);
    };
    input.click();
  };

  dlg.querySelector('#tpl-export').onclick = () => {
    if (!selectedName) { showToast('Select a template first', 'info'); return; }
    const allTemplates = loadGlobalTemplates();
    const template = allTemplates[selectedName];
    if (!template) return;
    const data = JSON.stringify({ version: 1, template }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template-${selectedName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported template "${selectedName}"`, 'success');
  };
}
