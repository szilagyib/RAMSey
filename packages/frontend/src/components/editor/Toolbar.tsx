import { useState, useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  CheckCircle,
  ArrowLeft,
  LayoutGrid,
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  Grid3x3,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Map,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { useDiagramStore } from '../../stores/diagramStore';
import { getDiagramTypeConfig } from '../../diagram-types/registry';
import { useAutoLayout, routeEdgesAfterLayout } from '../../hooks/useAutoLayout';
import { useEditorPrefs, type BackgroundMode } from '../../stores/editorPrefs';
import { parseDiagramJson } from '../../lib/importDiagram';
import { pickJsonFile } from '../../lib/exportUtils';
import { cn } from '../../lib/utils';
import { MenuBar, type MenuDefinition } from './MenuBar';
import { DiagramTitle } from './DiagramTitle';
import { ExportDialog } from './ExportDialog';
import { ThemeToggle } from '../ui/ThemeToggle';
import { NotificationBell } from '../NotificationBell';
import { useAuth } from '../../contexts/auth';

// Shared "Fit to Screen" options — keep the menu item and the toolbar button
// behaving identically.
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 };

/** Inputs that hold typed text, and so own Ctrl+Z themselves. */
const NON_TEXT_INPUT_TYPES = new Set([
  'range',
  'checkbox',
  'radio',
  'color',
  'button',
  'submit',
  'reset',
  'file',
]);

function isTextEntry(input: HTMLInputElement): boolean {
  return !NON_TEXT_INPUT_TYPES.has(input.type);
}

interface ToolbarProps {
  onNavigateBack?: () => void;
  onSave?: () => void;
  onCreateSnapshot?: () => void;
  onValidate?: () => void;
  onAnalyze?: () => void;
  diagramName?: string;
  onRename: (name: string) => void;
  isSaving?: boolean;
  collaborators?: Array<{ id?: string; name?: string; color?: string }>;
}

export function Toolbar({
  onNavigateBack,
  onSave,
  onCreateSnapshot,
  onValidate,
  onAnalyze,
  diagramName,
  onRename,
  isSaving,
  collaborators = [],
}: ToolbarProps) {
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
  const selectAll = useDiagramStore((s) => s.selectAll);
  const hasNodeSelection = useDiagramStore(
    (s) => s.selectedNodeId !== null || s.nodes.some((n) => n.selected),
  );
  const hasEdgeSelection = useDiagramStore(
    (s) => s.selectedEdgeId !== null || s.edges.some((e) => e.selected),
  );
  const canPaste = useDiagramStore((s) => s.clipboard !== null);
  const background = useEditorPrefs((s) => s.background);
  const setBackground = useEditorPrefs((s) => s.setBackground);
  const cycleBackground = useEditorPrefs((s) => s.cycleBackground);
  const minimap = useEditorPrefs((s) => s.minimap);
  const toggleMinimap = useEditorPrefs((s) => s.toggleMinimap);
  const palette = useEditorPrefs((s) => s.palette);
  const togglePalette = useEditorPrefs((s) => s.togglePalette);
  const inspector = useEditorPrefs((s) => s.inspector);
  const toggleInspector = useEditorPrefs((s) => s.toggleInspector);
  const alignSelection = useDiagramStore((s) => s.alignSelection);
  const distributeSelection = useDiagramStore((s) => s.distributeSelection);
  // Align needs 2+ nodes; distribute needs 3+ (there must be a gap to even out).
  const selectedCount = useDiagramStore((s) => {
    const flagged = s.nodes.filter((n) => n.selected).length;
    return flagged > 0 ? flagged : s.selectedNodeId ? 1 : 0;
  });
  const getValidationResults = useDiagramStore((s) => s.getValidationResults);
  const { autoLayout } = useAutoLayout();

  const [showExport, setShowExport] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const applyImportedJson = useCallback((text: string) => {
    const result = parseDiagramJson(text);
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

  // Hidden-input fallback (Firefox/Safari have no file picker API).
  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-importing the same file
      if (!file) return;
      applyImportedJson(await file.text());
    },
    [applyImportedJson],
  );

  const handleImportClick = useCallback(async () => {
    const picked = await pickJsonFile();
    if (picked.status === 'ok') applyImportedJson(picked.text);
    else if (picked.status === 'unsupported') importInputRef.current?.click();
  }, [applyImportedJson]);

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
      //
      // Only *text entry* counts. A range slider, a checkbox or a colour picker
      // has no native undo to protect, so treating them as editable just ate the
      // shortcut: fade a node with the opacity slider, press Ctrl+Z, nothing.
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.isContentEditable ||
          target.tagName === 'TEXTAREA' ||
          (target.tagName === 'INPUT' && isTextEntry(target as HTMLInputElement)));
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
        } else if (key === 'a') {
          e.preventDefault(); // Ctrl+A would select the page text
          selectAll();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave, undo, redo, copySelection, paste, duplicateSelection, selectAll]);

  const handleAutoLayout = useCallback(async () => {
    // Fault trees read top-down per the notation; every other type is a
    // left-to-right flow.
    const direction = diagramType === 'fault_tree' ? 'DOWN' : 'RIGHT';
    const layoutedNodes = await autoLayout(nodes, edges, { direction });
    // Re-route edges for the new positions: hand-placed control points would
    // point at stale coordinates, and bidirectional pairs need fresh arcs so
    // they don't collapse onto one another.
    const routedEdges = routeEdgesAfterLayout(layoutedNodes, edges);

    // One undo entry for the whole layout (positions + edge routing).
    useDiagramStore.getState().runInHistoryEntry(() => {
      setNodes(layoutedNodes);
      useDiagramStore.setState({ edges: routedEdges });
    });

    // Frame the result so the user sees the whole diagram.
    window.setTimeout(() => reactFlow.fitView(FIT_VIEW_OPTIONS), 60);
  }, [nodes, edges, diagramType, autoLayout, setNodes, reactFlow]);

  const handleValidate = useCallback(() => {
    onValidate?.();
  }, [onValidate]);

  const handleClearDiagram = useCallback(() => {
    if (!window.confirm('Clear the entire diagram?')) return;
    useDiagramStore.getState().runInHistoryEntry(() => {
      useDiagramStore.setState({ nodes: [], edges: [], nodeCounter: 0, edgeCounter: 0 });
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
          onClick: handleImportClick,
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
          onClick: selectAll,
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
      label: 'Align',
      items: [
        {
          label: 'Align Left',
          onClick: () => alignSelection('left'),
          disabled: selectedCount < 2,
        },
        {
          label: 'Align Center',
          onClick: () => alignSelection('center-x'),
          disabled: selectedCount < 2,
        },
        {
          label: 'Align Right',
          onClick: () => alignSelection('right'),
          disabled: selectedCount < 2,
        },
        { divider: true },
        {
          label: 'Align Top',
          onClick: () => alignSelection('top'),
          disabled: selectedCount < 2,
        },
        {
          label: 'Align Middle',
          onClick: () => alignSelection('center-y'),
          disabled: selectedCount < 2,
        },
        {
          label: 'Align Bottom',
          onClick: () => alignSelection('bottom'),
          disabled: selectedCount < 2,
        },
        { divider: true },
        {
          label: 'Distribute Horizontally',
          onClick: () => distributeSelection('horizontal'),
          disabled: selectedCount < 3,
        },
        {
          label: 'Distribute Vertically',
          onClick: () => distributeSelection('vertical'),
          disabled: selectedCount < 3,
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
        ...(['dots', 'grid', 'none'] as BackgroundMode[]).map((mode) => ({
          label: `Background: ${mode}`,
          checked: background === mode,
          onClick: () => setBackground(mode),
        })),
        { divider: true },
        {
          label: 'Minimap',
          checked: minimap,
          onClick: toggleMinimap,
        },
        {
          label: 'Palette',
          checked: palette,
          onClick: togglePalette,
        },
        {
          label: 'Properties panel',
          checked: inspector,
          onClick: toggleInspector,
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

          {/* Editing action group — the common operations mirrored from the
              Edit menu so they're one click away. */}
          <div className="ml-1 h-4 w-px bg-surface-200" />
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => undo()}
              disabled={!canUndo}
              className="h-7 w-7 p-0"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => redo()}
              disabled={!canRedo}
              className="h-7 w-7 p-0"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
            <span className="mx-0.5 h-4 w-px bg-surface-200" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copySelection()}
              disabled={!hasNodeSelection}
              className="h-7 w-7 p-0"
              title="Copy (Ctrl+C)"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => paste()}
              disabled={!canPaste}
              className="h-7 w-7 p-0"
              title="Paste (Ctrl+V)"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => duplicateSelection()}
              disabled={!hasNodeSelection}
              className="h-7 w-7 p-0"
              title="Duplicate (Ctrl+D)"
            >
              <CopyPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteSelected()}
              disabled={!hasNodeSelection && !hasEdgeSelection}
              className="h-7 w-7 p-0"
              title="Delete (Del)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>

            {/* Align / distribute — enabled once a multi-selection exists. */}
            <span className="mx-0.5 h-4 w-px bg-surface-200" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => alignSelection('center-y')}
              disabled={selectedCount < 2}
              className="h-7 w-7 p-0"
              title="Align middle (horizontal row)"
            >
              <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => alignSelection('center-x')}
              disabled={selectedCount < 2}
              className="h-7 w-7 p-0"
              title="Align center (vertical column)"
            >
              <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => distributeSelection('horizontal')}
              disabled={selectedCount < 3}
              className="h-7 w-7 p-0"
              title="Distribute horizontally"
            >
              <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => distributeSelection('vertical')}
              disabled={selectedCount < 3}
              className="h-7 w-7 p-0"
              title="Distribute vertically"
            >
              <AlignVerticalDistributeCenter className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <DiagramTitle name={diagramName} onRename={onRename} />

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
                <span className="text-[10px] text-surface-400">+{collaborators.length - 4}</span>
              )}
            </div>
          )}

          {validationResult && (
            // The badge is the obvious thing to click when it reports errors, so
            // it opens the same results panel as Analysis > Validate Diagram.
            <button
              type="button"
              onClick={handleValidate}
              disabled={!onValidate}
              title="Show validation results"
              aria-label="Show validation results"
              className={cn(
                'mr-1 flex items-center gap-1 rounded px-1.5 py-1 transition-colors',
                onValidate ? 'hover:bg-surface-100' : 'cursor-default',
              )}
            >
              {validationResult.valid ? (
                <CheckCircle className="h-3.5 w-3.5 text-state-operational-500" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-state-degraded-500" />
              )}
              <span className="text-[10px] text-surface-500">
                {validationResult.errors.length}E / {validationResult.warnings.length}W
              </span>
            </button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleAutoLayout}
            className="h-7 w-7 p-0"
            title="Auto Layout"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={cycleBackground}
            className={cn('h-7 w-7 p-0', background !== 'none' && 'text-primary-600')}
            title={`Background: ${background} (click to cycle)`}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleMinimap}
            className={cn('h-7 w-7 p-0', minimap && 'text-primary-600')}
            title={minimap ? 'Hide minimap' : 'Show minimap'}
          >
            <Map className="h-3.5 w-3.5" />
          </Button>
          <span className="mx-0.5 h-4 w-px bg-surface-200" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => reactFlow.zoomIn()}
            className="h-7 w-7 p-0"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => reactFlow.zoomOut()}
            className="h-7 w-7 p-0"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => reactFlow.fitView(FIT_VIEW_OPTIONS)}
            className="h-7 w-7 p-0"
            title="Fit to Screen"
          >
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
