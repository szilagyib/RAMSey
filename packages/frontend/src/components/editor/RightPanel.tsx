import { useState } from 'react';
import { MessageSquare, Settings2 } from 'lucide-react';
import { PropertyPanel } from './PropertyPanel';
import { ChatPanel } from './ChatPanel';
import { useCapabilities } from '../../lib/capabilities';
import { cn } from '../../lib/utils';

type Tab = 'properties' | 'chat';

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('properties');
  const { aiChat } = useCapabilities();

  // When the deployment has no AI configured, the panel is properties-only:
  // no tab bar, no dead "AI Chat" tab.
  const showChat = aiChat;
  const tab: Tab = showChat ? activeTab : 'properties';

  return (
    <aside className="flex w-72 shrink-0 min-h-0 flex-col border-l border-surface-200 bg-white dark:bg-surface-100">
      {showChat && (
        <div className="flex border-b border-surface-200">
          <button
            onClick={() => setActiveTab('properties')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
              tab === 'properties'
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-surface-400 hover:text-surface-600',
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Properties
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
              tab === 'chat'
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-surface-400 hover:text-surface-600',
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            AI Chat
          </button>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'properties' && <PropertyPanel />}
        {tab === 'chat' && showChat && <ChatPanel />}
      </div>
    </aside>
  );
}
