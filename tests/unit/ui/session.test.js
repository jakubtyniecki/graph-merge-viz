import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  migrateOldSession, migrateTemplate, migrateTrackingFields,
  migrateLayoutColors, generateDefaultLayout,
  exportSession, importSession, setupSession,
  disableSessionControls, enableSessionControls, loadScenarioSession
} from '../../../src/ui/session.js';
import { exportChoiceDialog, showToast } from '../../../src/ui/dialogs.js';

vi.mock('../../../src/ui/dialogs.js', () => ({
  exportChoiceDialog: vi.fn(),
  showToast: vi.fn(),
  closeDialog: vi.fn(),
  openDialog: vi.fn(),
  editTemplateDialog: vi.fn(),
  newSessionDialog: vi.fn(),
  exportChoiceDialog: vi.fn(),
}));

describe('Session Controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
    const mockContainer = {
      classList: {
        add: vi.fn(),
        remove: vi.fn()
      },
      querySelectorAll: vi.fn().mockReturnValue([])
    };
    vi.stubGlobal('document', {
      getElementById: vi.fn().mockReturnValue(mockContainer),
      addEventListener: vi.fn(),
    });
  });

  it('disableSessionControls adds disabled class', () => {
    disableSessionControls();
    const container = document.getElementById('session-controls');
    expect(container.classList.add).toHaveBeenCalledWith('disabled-controls');
  });

  it('enableSessionControls removes disabled class', () => {
    enableSessionControls();
    const container = document.getElementById('session-controls');
    expect(container.classList.remove).toHaveBeenCalledWith('disabled-controls');
  });
});

describe('loadScenarioSession', () => {
  let mockPanels;
  let mockLayoutManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
    const mockContainer = {
      classList: { add: vi.fn(), remove: vi.fn() },
      querySelectorAll: vi.fn().mockReturnValue([]),
      querySelector: vi.fn().mockReturnValue({}),
      innerHTML: ''
    };
    vi.stubGlobal('document', {
      getElementById: vi.fn().mockReturnValue(mockContainer),
      addEventListener: vi.fn(),
    });

    vi.stubGlobal('MutationObserver', class {
      constructor() {}
      observe() {}
      disconnect() {}
    });

    mockPanels = new Map();
    mockLayoutManager = {
      getLayout: vi.fn().mockReturnValue({ tree: null }),
      setLayout: vi.fn(),
    };
    setupSession(mockPanels, mockLayoutManager, vi.fn());
  });

  it('loads scenario data into session', () => {
    const scenarioData = {
      layout: { tree: { type: 'panel', id: '1' }, nextId: 2 },
      panels: {
        '1': { graph: { nodes: [], edges: [] } }
      },
      template: { name: 'Test' }
    };

    const mockPanel = { setState: vi.fn() };
    mockPanels.set('1', mockPanel);

    loadScenarioSession(scenarioData);

    expect(mockLayoutManager.setLayout).toHaveBeenCalledWith(scenarioData.layout);
    expect(mockPanel.setState).toHaveBeenCalledWith(scenarioData.panels['1']);
  });
});

describe('Session Migrations', () => {
  it('migrateTemplate ensures specialTypes exists', () => {
    const session = {
      template: { name: 'T', graphType: 'DG', nodeTypes: [], edgeTypes: [] }
    };
    const migrated = migrateTemplate(session);
    expect(migrated.template.specialTypes).toEqual([]);
  });

  it('migrateTrackingFields adds path tracking defaults', () => {
    const session = {
      panels: {
        '1': { graph: { nodes: [], edges: [] } }
      }
    };
    const migrated = migrateTrackingFields(session);
    expect(migrated.panels['1'].pathTrackingEnabled).toBe(false);
    expect(migrated.panels['1'].showExclusions).toBe(true);
    expect(migrated.panels['1'].exclusions).toEqual({});
  });

  it('migrateLayoutColors ensures borderColor and bgColor exist on panel nodes', () => {
    const session = {
      layout: {
        tree: {
          type: 'split',
          direction: 'v',
          children: [
            { type: 'panel', id: '1' },
            {
              type: 'split',
              direction: 'h',
              children: [
                { type: 'panel', id: '2', borderColor: '#ff0000' },
                { type: 'panel', id: '3' }
              ],
              sizes: [50, 50]
            }
          ],
          sizes: [50, 50]
        }
      }
    };

    const migrated = migrateLayoutColors(session);
    const tree = migrated.layout.tree;
    
    // Panel 1: missing both
    expect(tree.children[0].hasOwnProperty('borderColor')).toBe(true);
    expect(tree.children[0].borderColor).toBeUndefined();
    expect(tree.children[0].hasOwnProperty('bgColor')).toBe(true);
    expect(tree.children[0].bgColor).toBeUndefined();

    // Panel 2: has borderColor, missing bgColor
    expect(tree.children[1].children[0].borderColor).toBe('#ff0000');
    expect(tree.children[1].children[0].hasOwnProperty('bgColor')).toBe(true);
    expect(tree.children[1].children[0].bgColor).toBeUndefined();

    // Panel 3: missing both
    expect(tree.children[1].children[1].hasOwnProperty('borderColor')).toBe(true);
    expect(tree.children[1].children[1].hasOwnProperty('bgColor')).toBe(true);
  });

  it('generateDefaultLayout creates a tree for N panels', () => {
    const ids = ['1', '2', '3'];
    const layout = generateDefaultLayout(ids);
    
    expect(layout.nextId).toBe(4);
    expect(layout.tree.type).toBe('split');
    // For 3 panels with equal sizes: Split(Split(P1, P2), P3)
    // P3 is child 1 of top split
    expect(layout.tree.children[1].type).toBe('panel');
    expect(layout.tree.children[1].id).toBe('3');
    // Split(P1, P2) is child 0
    expect(layout.tree.children[0].type).toBe('split');
    expect(layout.tree.children[0].children[0].id).toBe('1');
    expect(layout.tree.children[0].children[1].id).toBe('2');
  });

  it('generateDefaultLayout handles 1 panel', () => {
    const layout = generateDefaultLayout(['1']);
    expect(layout.tree.type).toBe('panel');
    expect(layout.tree.id).toBe('1');
    expect(layout.nextId).toBe(2);
  });
});

describe('exportSession', () => {
  let mockPanels;
  let mockLayoutManager;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      innerWidth: 1024,
      innerHeight: 768,
    });

    vi.stubGlobal('MutationObserver', class {
      constructor() {}
      observe() {}
      disconnect() {}
    });

    // Mock document.createElement for download link
    const mockAnchor = { click: vi.fn(), href: '', download: '' };
    const mockContainer = {
      querySelector: vi.fn().mockReturnValue({}),
      querySelectorAll: vi.fn().mockReturnValue([]),
      appendChild: vi.fn(),
      contains: vi.fn().mockReturnValue(true),
      innerHTML: '',
      classList: { add: vi.fn(), remove: vi.fn() }
    };
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(mockAnchor),
      getElementById: vi.fn().mockReturnValue(mockContainer),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      body: { 
        appendChild: vi.fn(),
        contains: vi.fn().mockReturnValue(true)
      },
      contains: vi.fn().mockReturnValue(true),
    });

    // Mock localStorage
    const store = {
      'graph-merge-active-session': 'Default',
      'graph-merge-sessions': JSON.stringify({
        'Default': {
          layout: { tree: null },
          panels: {},
          template: { name: 'Default' }
        }
      })
    };
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(key => store[key]),
      setItem: vi.fn((key, val) => { store[key] = val; }),
    });

    // Mock URL and Blob for download
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:url'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('Blob', vi.fn());

    mockPanels = new Map();
    mockLayoutManager = {
      getLayout: vi.fn().mockReturnValue({ tree: null }),
      setLayout: vi.fn(),
      init: vi.fn(),
    };
    // Setup session so exportSession has context
    setupSession(mockPanels, mockLayoutManager, vi.fn());
  });

  it('calls exportChoiceDialog and exports full session when choice is "session"', async () => {
    exportChoiceDialog.mockResolvedValue('session');

    await exportSession();

    expect(exportChoiceDialog).toHaveBeenCalled();
    const blobCall = vi.mocked(Blob).mock.calls[0][0][0];
    const data = JSON.parse(blobCall);
    expect(data.exportType).toBe('session');
    expect(data.sessionName).toBe('Default');
  });

  it('exports only data when choice is "data"', async () => {
    exportChoiceDialog.mockResolvedValue('data');
    
    const mockPanel = {
      id: '1',
      getState: () => ({
        graph: { nodes: [], edges: [] },
        pathTrackingEnabled: true,
        exclusions: { 'A->B': ['tag1'] },
        someOtherField: 'should not be here'
      })
    };
    mockPanels.set('1', mockPanel);

    await exportSession();

    expect(exportChoiceDialog).toHaveBeenCalled();
    const blobCall = vi.mocked(Blob).mock.calls[0][0][0];
    const data = JSON.parse(blobCall);
    expect(data.exportType).toBe('data');
    expect(data.panels['1']).toEqual({
      graph: { nodes: [], edges: [] },
      pathTrackingEnabled: true,
      exclusions: { 'A->B': ['tag1'] }
    });
    expect(data.panels['1'].someOtherField).toBeUndefined();
  });

  it('does nothing when choice is null (cancelled)', async () => {
    exportChoiceDialog.mockResolvedValue(null);

    await exportSession();

    expect(exportChoiceDialog).toHaveBeenCalled();
    expect(Blob).not.toHaveBeenCalled();
  });
});

describe('importSession', () => {
  let mockPanels;
  let mockLayoutManager;
  let store;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      innerWidth: 1024,
      innerHeight: 768,
    });

    vi.stubGlobal('MutationObserver', class {
      constructor() {}
      observe() {}
      disconnect() {}
    });

    const mockAnchor = { click: vi.fn(), href: '', download: '' };
    const mockContainer = {
      querySelector: vi.fn().mockReturnValue({}),
      querySelectorAll: vi.fn().mockReturnValue([]),
      appendChild: vi.fn(),
      contains: vi.fn().mockReturnValue(true),
      innerHTML: '',
      classList: { add: vi.fn(), remove: vi.fn() }
    };
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(mockAnchor),
      getElementById: vi.fn().mockReturnValue(mockContainer),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      body: { 
        appendChild: vi.fn(),
        contains: vi.fn().mockReturnValue(true)
      },
      contains: vi.fn().mockReturnValue(true),
    });

    store = {
      'graph-merge-active-session': 'Default',
      'graph-merge-sessions': JSON.stringify({})
    };
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(key => store[key]),
      setItem: vi.fn((key, val) => { store[key] = val; }),
    });

    vi.stubGlobal('prompt', vi.fn().mockReturnValue('Imported'));

    mockPanels = new Map();
    mockLayoutManager = {
      getLayout: vi.fn().mockReturnValue({ tree: null }),
      setLayout: vi.fn(),
      init: vi.fn(),
    };
    setupSession(mockPanels, mockLayoutManager, vi.fn());
  });

  it('correctly handles "data" only import by generating layout', async () => {
    const dataOnlyJson = JSON.stringify({
      version: 2,
      exportType: 'data',
      panels: {
        '1': { graph: { nodes: [], edges: [] } },
        '2': { graph: { nodes: [], edges: [] } }
      },
      template: { name: 'Default' }
    });

    vi.stubGlobal('FileReader', class {
      constructor() {}
      readAsText() {
        this.onload({ target: { result: dataOnlyJson } });
      }
    });

    // Trigger importSession
    importSession();
    
    // Simulate file input change
    const input = vi.mocked(document.createElement).mock.results.find(r => r.value.type === 'file').value;
    input.files = [{}]; // Mock file object
    input.onchange();

    const sessions = JSON.parse(store['graph-merge-sessions']);
    expect(sessions['Imported']).toBeDefined();
    expect(sessions['Imported'].layout).toBeDefined();
    expect(sessions['Imported'].layout.tree).toBeDefined();
    expect(sessions['Imported'].panels['1']).toBeDefined();
    expect(sessions['Imported'].panels['2']).toBeDefined();
  });
});
