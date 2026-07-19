import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DiagramEditor } from '../components/editor/DiagramEditor';
import { FMEAEditor } from '../diagram-types/fmea/FMEAEditor';
import { Button } from '../components/ui/Button';
import { MenuBar, type MenuDefinition } from '../components/editor/MenuBar';
import { DiagramTitle } from '../components/editor/DiagramTitle';
import { ExportDialog } from '../components/editor/ExportDialog';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useDiagramStore } from '../stores/diagramStore';
import { useFMEAStore } from '../stores/fmeaStore';
import { getDiagramTypeConfig } from '../diagram-types/registry';
import { toEngineType } from '../lib/diagramTypeMapping';
import { getDataService } from '../services/dataService';
import { useAuth } from '../contexts/auth';
import { cn } from '../lib/utils';

export function EditorPage() {
  const { projectId, diagramId } = useParams<{ projectId: string; diagramId: string }>();
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const ds = getDataService(user?.id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [diagramName, setDiagramName] = useState('');

  const loadDiagram = useDiagramStore((s) => s.loadDiagram);
  const diagramType = useDiagramStore((s) => s.diagramType);
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const setDiagramType = useDiagramStore((s) => s.setDiagramType);

  const fmeaRows = useFMEAStore((s) => s.rows);
  const loadFMEARows = useFMEAStore((s) => s.loadRows);

  const config = getDiagramTypeConfig(diagramType);
  const isTableBased = config?.isTableBased ?? false;
  const typeName = config?.name ?? 'Diagram';

  const [showExport, setShowExport] = useState(false);

  const fetchDiagram = useCallback(async () => {
    if (!projectId || !diagramId) return;
    try {
      const res = await ds.diagrams.get(projectId, diagramId);
      const diagram = res.data;
      const engineType = toEngineType(diagram.type);

      setDiagramName(diagram.name);
      setDiagramType(engineType);

      const content = diagram.content as {
        nodes?: unknown[];
        edges?: unknown[];
        rows?: unknown[];
      } | null;

      if (engineType === 'fmea' && content?.rows) {
        loadFMEARows(content.rows as typeof fmeaRows);
      } else if (content?.nodes || content?.edges) {
        loadDiagram(
          (content.nodes ?? []) as typeof nodes,
          (content.edges ?? []) as typeof edges,
          engineType,
        );
      } else {
        loadDiagram([], [], engineType);
      }
    } catch {
      // Diagram not found or API unavailable — start fresh with the current
      // type (read imperatively so this callback doesn't depend on it).
      loadDiagram([], [], useDiagramStore.getState().diagramType);
    } finally {
      setLoading(false);
    }
  }, [projectId, diagramId, ds, setDiagramType, loadDiagram, loadFMEARows]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount; state updates happen after await, not synchronously
    fetchDiagram();
  }, [fetchDiagram]);

  const handleSave = useCallback(async () => {
    if (!projectId || !diagramId) return;
    // Authenticated graph diagrams are persisted via the collaborative Yjs doc
    // (the server derives `content` from it); there is no separate content write.
    if (!isGuest && !isTableBased) return;
    setSaving(true);
    try {
      const content = isTableBased ? { rows: fmeaRows } : { nodes, edges };

      await ds.diagrams.update(projectId, diagramId, { content });
    } catch (err) {
      window.alert(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  }, [projectId, diagramId, ds, isGuest, isTableBased, fmeaRows, nodes, edges]);

  const handleCreateSnapshot = useCallback(async () => {
    if (!projectId || !diagramId) return;
    try {
      await ds.diagrams.createSnapshot(projectId, diagramId);
      window.alert('Snapshot created.');
    } catch (err) {
      window.alert(`Failed to create snapshot: ${err}`);
    }
  }, [projectId, diagramId, ds]);

  const handleRename = useCallback(
    async (newName: string) => {
      if (!projectId || !diagramId) return;
      // Show the new name straight away, then put the old one back if the write
      // fails — a header that disagrees with what's stored is worse than none.
      const previous = diagramName;
      setDiagramName(newName);
      try {
        await ds.diagrams.update(projectId, diagramId, { name: newName });
      } catch (err) {
        setDiagramName(previous);
        window.alert(`Failed to rename diagram: ${err}`);
      }
    },
    [projectId, diagramId, diagramName, ds],
  );

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  // Keyboard shortcuts for table-based editors (graph editors handle their own)
  useEffect(() => {
    if (!isTableBased) return;
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (ctrl && e.key === 'e') {
        e.preventDefault();
        setShowExport(true);
      }
      // Undo/redo — but never inside a table cell, where Ctrl+Z must stay the
      // browser's native text undo (which flows back through onChange anyway).
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
          useFMEAStore.getState().undo();
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault();
          useFMEAStore.getState().redo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isTableBased, handleSave]);

  const canUndoFMEA = useFMEAStore((s) => s.undoStack.length > 0);
  const canRedoFMEA = useFMEAStore((s) => s.redoStack.length > 0);

  const fmeaMenus: MenuDefinition[] = [
    {
      label: 'File',
      items: [
        { label: 'New Diagram', shortcut: '', onClick: () => handleBack(), disabled: false },
        { divider: true },
        {
          label: saving ? 'Saving...' : 'Save',
          shortcut: 'Ctrl+S',
          onClick: () => handleSave(),
          disabled: saving,
        },
        { divider: true },
        { label: 'Back to Dashboard', onClick: () => handleBack() },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          onClick: () => useFMEAStore.getState().undo(),
          disabled: !canUndoFMEA,
        },
        {
          label: 'Redo',
          shortcut: 'Ctrl+Shift+Z',
          onClick: () => useFMEAStore.getState().redo(),
          disabled: !canRedoFMEA,
        },
        { divider: true },
        { label: 'Add Row', onClick: () => useFMEAStore.getState().addRow() },
      ],
    },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-50">
        <p className="text-sm text-surface-400">Loading diagram...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface-50">
      {isTableBased ? (
        <>
          <header className="flex h-10 shrink-0 items-center justify-between border-b border-surface-200 bg-white dark:bg-surface-100 px-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleBack} className="h-7 w-7 p-0">
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <img src="/favicon.svg" alt="RAMSey" className="h-5 w-5" />
              <h1 className="text-sm font-bold text-primary-600">RAMSey</h1>
              <span className="text-[10px] text-surface-400">{typeName}</span>
              <div className="ml-1 h-4 w-px bg-surface-200" />
              <MenuBar menus={fmeaMenus} />
            </div>
            <div className="flex items-center gap-1">
              <DiagramTitle name={diagramName} onRename={handleRename} />
              {saving && <span className="mr-1 text-[10px] text-surface-400">Saving…</span>}
              {user && (
                <div
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white',
                    isGuest ? 'bg-surface-400' : 'bg-primary-500',
                  )}
                  title={isGuest ? 'Guest (local mode)' : (user.name ?? user.email ?? '')}
                >
                  {(user.name ?? user.email ?? 'G').slice(0, 2).toUpperCase()}
                </div>
              )}
              <ThemeToggle />
            </div>
          </header>
          <div className="flex-1 overflow-auto">
            <FMEAEditor />
          </div>
          <ExportDialog
            open={showExport}
            onClose={() => setShowExport(false)}
            diagramName={diagramName || 'diagram'}
          />
        </>
      ) : (
        <div className="relative min-h-0 flex-1">
          <DiagramEditor
            onNavigateBack={handleBack}
            onSave={handleSave}
            onRename={handleRename}
            onCreateSnapshot={handleCreateSnapshot}
            diagramName={diagramName}
            isSaving={saving}
            projectId={projectId}
            diagramId={diagramId}
          />
        </div>
      )}
    </div>
  );
}
