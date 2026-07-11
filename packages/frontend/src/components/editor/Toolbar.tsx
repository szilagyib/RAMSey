import { useState, useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { ZoomIn, ZoomOut, Maximize2, AlertTriangle, CheckCircle, ArrowLeft, LayoutGrid } from 'lucide-react';
import { Button } from '../ui/Button';
import { useDiagramStore } from '../../stores/diagramStore';
import { getDiagramTypeConfig } from '../../diagram-types/registry';
import { useAutoLayout } from '../../hooks/useAutoLayout';
import { parseDiagramJson } from '../../lib/importDiagram';
import { MenuBar, type MenuDefinition } from './MenuBar';
import { ExportDialog } from './ExportDialog';
import { ThemeToggle } from '../ui/ThemeToggle';
import { NotificationBell } from '../NotificationBell';
import { useAuth } from '../../contexts/auth';

// Shared "Fit to Screen" options — keep the menu item and the toolbar button
// behaving identically.
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 };

interface ToolbarProps {
  onNavigateBack?: () => void;
  onSave?: () => void;
  onCreateSnapshot?: () => void;
  onValidate?: () => void;
  onAnalyze?: () => void;
  diagramName?: string;
  isSaving?: boolean;
  collaborators?: Array<{ id?: string; name?: string; color?: string }>;
}

export function Toolbar({ onNavigateBack, onSave, onCreateSnapshot, onValidate, onAnalyze, diagramName, isSaving, collaborators = [] }: ToolbarProps) {
  const { user: authUser } = useAuth();
  const reactFlow = useReactFlow();
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const diagramType = useDiagramStore((s) => s.diagramType);
  const setNodes = useDiagramStore((s) => s.setNodes);
  const deleteSelected = useDiagramStore((s) => s.deleteSelected);
  const clearSelection = useDiagramStore((s) => s.clearSelection);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);
  const canUndo = useDiagramStore((s) => s.undoStack.length > 0);
  const canRedo = useDiagramStore((s) => s.redoStack.length > 0);
  const copySelection = useDiagramStore((s) => s.copySelection);
  const paste = useDiagramStore((s) => s.paste);
  const duplicateSelection = useDiagramStore((s) => s.duplicateSelection);
  const hasNodeSelection = useDiagramStore(
    (s) => s.selectedNodeId !== null || s.nodes.some((n) => n.selected),
  );
  const canPaste = useDiagramStore((s) => s.clipboard !== null);
  const getValidationResults = useDiagramStore((s) => s.getValidationResults);
  const { autoLayout } = useAutoLayout();

  const [showExport, setShowExport] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    const result = parseDiagramJson(await file.text());
    if ('error' in result) {
      window.alert(`Import failed: ${result.error}`);
      return;
    }
    const currentType = useDiagramStore.getState().diagramType;
    // The diagram record's type is fixed server-side; silently switching the
    // canvas type would desync it from persistence. Refuse mismatches.
    if (result.type && result.type !== currentType) {
      window.alert(
        `This file is a ${result.type.replace(/_/g, ' ')} diagram — create a diagram of that type and import it there.`,
      );
      return;
    }
    if (
      useDiagramStore.getState().nodes.length > 0 &&
      !window.confirm('Importing replaces the current diagram. Continue?')
    ) {
      return;
    }
    useDiagramStore.getState().loadDiagram(result.nodes, result.edges, currentType);
  }, []);

  const config = getDiagramTypeConfig(diagramType);
  const typeName = config?.name ?? 'Diagram';
  const validationResult = nodes.length > 0 ? getValidationResults() : null;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 's') {
        e.preventDefault();
        onSave?.();
      }
      if (ctrl && e.key === 'e') {
        e.preventDefault();
        setShowExport(true);
      }
      // Undo/redo — but never inside text fields, where Ctrl+Z must stay the
      // browser's native text undo.
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (ctrl && !inEditable) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault();
          redo();
        } else if (key === 'c') {
          // Only claim Ctrl+C when a node is selected — otherwise leave the
          // browser's copy (e.g. of selected text) alone.
          if (copySelection()) e.preventDefault();
        } else if (key === 'v') {
          if (useDiagramStore.getState().clipboard) {
            e.preventDefault();
            paste();
          }
        } else if (key === 'd') {
          e.preventDefault(); // always: Ctrl+D would bookmark the page
          duplicateSelection();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave, undo, redo, copySelection, paste, duplicateSelection]);

  const handleAutoLayout = useCallback(async () => {
    // Fault trees read top-down per the notation; every other type is a
    // left-to-right flow.
    const direction = diagramType === 'fault_tree' ? 'DOWN' : 'RIGHT';
    const layoutedNodes = await autoLayout(nodes, edges, { direction });
    // One undo entry for the whole layout (positions + control-point resets).
    useDiagramStore.getState().runInHistoryEntry(() => {
      setNodes(layoutedNodes);
      // A re-layout invalidates hand-placed edge control points: reset every
      // edge to automatic routing so nothing points at stale coordinates.
      useDiagramStore.setState((state) => ({
        edges: state.edges.map((e) =>
          (e.data as { cpX?: unknown })?.cpX != null
            ? { ...e, data: { ...e.data, cpX: null, cpY: null } }
            : e,
        ),
      }));
    });
  }, [nodes, edges, diagramType, autoLayout, setNodes]);

  const handleValidate = useCallback(() => {
    onValidate?.();
  }, [onValidate]);

  const handleClearDiagram = useCallback(() => {
    if (!window.confirm('Clear the entire diagram?')) return;
    useDiagramStore.getState().runInHistoryEntry(() => {
      useDiagramStore.setState({ nodes: [], edges: [], nodeCounter: 0, edgeCounter: 0 });
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    // React Flow multi-select: mark every node/edge selected so they highlight
    // and the canvas delete key applies to all of them.
    const state = useDiagramStore.getState();
    state.setNodes(state.nodes.map((n) => ({ ...n, selected: true })));
    useDiagramStore.setState({
      edges: state.edges.map((e) => ({ ...e, selected: true })),
    });
  }, []);

  // Menu definitions
  const menus: MenuDefinition[] = [
    {
      label: 'File',
      items: [
        {
          label: 'New Diagram',
          shortcut: '',
          onClick: () => onNavigateBack?.(),
          disabled: !onNavigateBack,
        },
        { divider: true },
        {
          label: isSaving ? 'Saving...' : 'Save',
          shortcut: 'Ctrl+S',
          onClick: () => onSave?.(),
          disabled: !onSave || isSaving,
        },
        { divider: true },
        {
          label: 'Import JSON...',
          onClick: () => importInputRef.current?.click(),
        },
        {
          label: 'Export...',
          shortcut: 'Ctrl+E',
          onClick: () => setShowExport(true),
        },
        {
          label: 'Create Snapshot',
          onClick: () => onCreateSnapshot?.(),
          disabled: !onCreateSnapshot,
        },
        { divider: true },
        {
          label: 'Back to Dashboard',
          onClick: () => onNavigateBack?.(),
          disabled: !onNavigateBack,
        },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          onClick: () => undo(),
          disabled: !canUndo,
        },
        {
          label: 'Redo',
          shortcut: 'Ctrl+Shift+Z',
          onClick: () => redo(),
          disabled: !canRedo,
        },
        { divider: true },
        {
          label: 'Copy',
          shortcut: 'Ctrl+C',
          onClick: () => copySelection(),
          disabled: !hasNodeSelection,
        },
        {
          label: 'Paste',
          shortcut: 'Ctrl+V',
          onClick: () => paste(),
          disabled: !canPaste,
        },
        {
          label: 'Duplicate',
          shortcut: 'Ctrl+D',
          onClick: () => duplicateSelection(),
          disabled: !hasNodeSelection,
        },
        { divider: true },
        {
          label: 'Delete Selected',
          shortcut: 'Del',
          onClick: () => deleteSelected(),
        },
        {
          label: 'Select All',
          shortcut: 'Ctrl+A',
          onClick: handleSelectAll,
        },
        { divider: true },
        {
          label: 'Clear Selection',
          shortcut: 'Esc',
          onClick: () => clearSelection(),
        },
        {
          label: 'Clear Diagram',
          onClick: handleClearDiagram,
        },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Zoom In',
          shortcut: 'Ctrl+=',
          onClick: () => reactFlow.zoomIn(),
        },
        {
          label: 'Zoom Out',
          shortcut: 'Ctrl+-',
          onClick: () => reactFlow.zoomOut(),
        },
        {
          label: 'Fit to Screen',
          shortcut: 'Ctrl+0',
          onClick: () => reactFlow.fitView(FIT_VIEW_OPTIONS),
        },
        { divider: true },
        {
          label: 'Auto Layout',
          onClick: handleAutoLayout,
        },
      ],
    },
    {
      label: 'Analysis',
      items: [
        {
          label: 'Validate Diagram',
          onClick: handleValidate,
        },
        {
          label: 'Run Analysis...',
          onClick: () => onAnalyze?.(),
          disabled: !onAnalyze,
        },
      ],
    },
  ];

  return (
    <>
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-surface-200 bg-white dark:bg-surface-100 px-3">
        <div className="flex items-center gap-2">
          {onNavigateBack && (
            <Button variant="ghost" size="sm" onClick={onNavigateBack} className="h-7 w-7 p-0">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          <img src="/favicon.svg" alt="RAMSey" className="h-5 w-5" />
          <h1 className="text-sm font-bold text-primary-600">RAMSey</h1>
          <span className="text-[10px] text-surface-400">{typeName}</span>
          <div className="ml-1 h-4 w-px bg-surface-200" />
          <MenuBar menus={menus} />
        </div>

        <div className="flex items-center gap-1">
          {diagramName && (
            <span className="mr-2 max-w-40 truncate text-xs font-medium text-surface-500">
              {diagramName}
            </span>
          )}

          {collaborators.length > 0 && (
            <div className="mr-2 flex items-center gap-1">
              {collaborators.slice(0, 4).map((user) => {
                const initials = (user.name ?? 'U')
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <div
                    key={user.id ?? initials}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: user.color ?? '#64748b' }}
                    title={user.name ?? 'Collaborator'}
                  >
                    {initials}
                  </div>
                );
              })}
              {collaborators.length > 4 && (
                <span className="text-[10px] text-surface-400">
                  +{collaborators.length - 4}
                </span>
              )}
            </div>
          )}

          {validationResult && (
            <div className="mr-1 flex items-center gap-1">
              {validationResult.valid ? (
                <CheckCircle className="h-3.5 w-3.5 text-state-operational-500" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-state-degraded-500" />
              )}
              <span className="text-[10px] text-surface-500">
                {validationResult.errors.length}E / {validationResult.warnings.length}W
              </span>
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={handleAutoLayout} className="h-7 w-7 p-0" title="Auto Layout">
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <span className="mx-0.5 h-4 w-px bg-surface-200" />
          <Button variant="ghost" size="sm" onClick={() => reactFlow.zoomIn()} className="h-7 w-7 p-0" title="Zoom In">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => reactFlow.zoomOut()} className="h-7 w-7 p-0" title="Zoom Out">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => reactFlow.fitView(FIT_VIEW_OPTIONS)} className="h-7 w-7 p-0" title="Fit to Screen">
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          {authUser && !authUser.id.startsWith('local:') && <NotificationBell />}
          {authUser && (
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-[10px] font-semibold text-white"
              title={authUser.name ?? authUser.email}
            >
              {(authUser.name ?? authUser.email).slice(0, 2).toUpperCase()}
            </div>
          )}
          <ThemeToggle />
        </div>
      </header>

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportFile}
        aria-label="Import diagram JSON"
      />

      <ExportDialog
        open={showExport}
        onClose={() => setShowExport(false)}
        diagramName={diagramName || 'diagram'}
      />
    </>
  );
}
