import { Sparkles, Settings2, BarChart3, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { PropertyPanel } from './PropertyPanel';
import { ChatPanel } from './ChatPanel';
import { AnalysisPanel } from './AnalysisPanel';
import { PanelResizer } from './PanelResizer';
import { useCapabilities } from '../../lib/capabilities';
import { useEditorPrefs, type RightTab } from '../../stores/editorPrefs';
import { cn } from '../../lib/utils';

interface RightPanelProps {
  projectId?: string;
  diagramId?: string;
}

export function RightPanel({ projectId, diagramId }: RightPanelProps) {
  const activeTab = useEditorPrefs((s) => s.rightTab);
  const setRightTab = useEditorPrefs((s) => s.setRightTab);
  const inspector = useEditorPrefs((s) => s.inspector);
  const toggleInspector = useEditorPrefs((s) => s.toggleInspector);
  const inspectorWidth = useEditorPrefs((s) => s.inspectorWidth);
  const setInspectorWidth = useEditorPrefs((s) => s.setInspectorWidth);
  const { aiChat } = useCapabilities();

  // Collapsed: a rail wide enough to click, so the canvas gets the width back.
  if (!inspector) {
    return (
      <aside className="flex w-8 shrink-0 flex-col items-center border-l border-surface-200 bg-white py-2 dark:bg-surface-100">
        <button
          onClick={toggleInspector}
          title="Show properties and analysis"
          aria-label="Show properties and analysis"
          className="rounded p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-200"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  // No dead "AI" tab when the deployment has no AI configured.
  const tabs: Array<{ id: RightTab; label: string; icon: typeof Settings2 }> = [
    { id: 'properties', label: 'Properties', icon: Settings2 },
    { id: 'analysis', label: 'Analysis', icon: BarChart3 },
    ...(aiChat ? [{ id: 'chat' as const, label: 'AI', icon: Sparkles }] : []),
  ];
  const tab: RightTab = tabs.some((t) => t.id === activeTab) ? activeTab : 'properties';

  return (
    <aside
      className="relative z-10 flex shrink-0 min-h-0 flex-col border-l border-surface-200 bg-white dark:bg-surface-100"
      style={{ width: inspectorWidth }}
    >
      <div className="flex items-stretch border-b border-surface-200">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setRightTab(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors',
              tab === id
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-surface-400 hover:text-surface-600',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
        <button
          onClick={toggleInspector}
          title="Collapse panel"
          aria-label="Collapse panel"
          className="shrink-0 px-2 text-surface-400 hover:text-surface-700"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'properties' && <PropertyPanel />}
        {tab === 'analysis' && <AnalysisPanel projectId={projectId} diagramId={diagramId} />}
        {tab === 'chat' && aiChat && <ChatPanel />}
      </div>

      <PanelResizer
        side="right"
        width={inspectorWidth}
        onResize={setInspectorWidth}
        label="Resize properties and analysis panel"
      />
    </aside>
  );
}
