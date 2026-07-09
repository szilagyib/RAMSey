import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useAuth } from '../contexts/auth';
import { useDiagramStore } from '../stores/diagramStore';
import { bindStore, pushStoreToDoc, loadDocToStore, isDocEmpty, type BindableStore } from '../lib/yjsBinding';
import type { RemoteCursor } from '../components/editor/CursorsOverlay';
import type { RemoteSelection } from '../components/editor/SelectionOverlay';

interface Peer {
  id?: string;
  name?: string;
  color?: string;
}

interface AwarenessLike {
  setLocalStateField(field: string, value: unknown): void;
}

const COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee', '#a3e635'];
function colorFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function useCollaboration(params: {
  projectId?: string;
  diagramId?: string;
  diagramType: string;
  enabled: boolean;
}) {
  const { enabled, diagramId } = params;
  const { user, isGuest } = useAuth();
  const [peers, setPeers] = useState<Peer[]>([]);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [selections, setSelections] = useState<RemoteSelection[]>([]);
  const awarenessRef = useRef<AwarenessLike | null>(null);

  useEffect(() => {
    if (!enabled || !diagramId || !user || isGuest) {
      setPeers([]);
      setCursors([]);
      setSelections([]);
      awarenessRef.current = null;
      return;
    }

    const store = useDiagramStore as unknown as BindableStore;
    const doc = new Y.Doc();
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const provider = new WebsocketProvider(`${proto}://${window.location.host}/yjs`, diagramId, doc, {
      connect: true,
    });

    // Presence/awareness.
    awarenessRef.current = provider.awareness;
    provider.awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name ?? user.email,
      color: colorFor(user.id),
    });
    const onAwarenessChange = () => {
      const others: Peer[] = [];
      const remoteCursors: RemoteCursor[] = [];
      const remoteSelections: RemoteSelection[] = [];
      for (const [clientId, state] of provider.awareness.getStates()) {
        if (clientId === provider.awareness.clientID) continue;
        const s = state as {
          user?: Peer;
          cursor?: { x: number; y: number } | null;
          selection?: { nodeId: string } | null;
        };
        if (s.user) others.push(s.user);
        if (s.user?.id && s.cursor && typeof s.cursor.x === 'number') {
          remoteCursors.push({
            id: s.user.id,
            name: s.user.name,
            color: s.user.color,
            x: s.cursor.x,
            y: s.cursor.y,
          });
        }
        if (s.selection?.nodeId) {
          remoteSelections.push({
            nodeId: s.selection.nodeId,
            name: s.user?.name,
            color: s.user?.color,
          });
        }
      }
      setPeers(others);
      setCursors(remoteCursors);
      setSelections(remoteSelections);
    };
    provider.awareness.on('change', onAwarenessChange);
    onAwarenessChange();

    // Bind store ↔ doc once the initial sync completes, choosing the seed direction.
    let unbind: (() => void) | null = null;
    let seeded = false;
    const onSync = (isSynced: boolean) => {
      if (!isSynced || seeded) return;
      seeded = true;
      if (isDocEmpty(doc)) {
        pushStoreToDoc(doc, store); // server has no state yet — seed from loaded diagram
      } else {
        loadDocToStore(doc, store); // existing collaborative state is authoritative
      }
      unbind = bindStore(doc, store);
    };
    provider.on('sync', onSync);

    return () => {
      provider.off('sync', onSync);
      provider.awareness.off('change', onAwarenessChange);
      unbind?.();
      provider.destroy();
      doc.destroy();
      awarenessRef.current = null;
      setPeers([]);
      setCursors([]);
      setSelections([]);
    };
  }, [enabled, diagramId, user, isGuest]);

  /** Broadcast the local cursor position (flow coordinates), or null to clear it. */
  const setCursor = useCallback((point: { x: number; y: number } | null) => {
    awarenessRef.current?.setLocalStateField('cursor', point);
  }, []);

  /** Broadcast the locally-selected node id, or null when nothing is selected. */
  const setSelection = useCallback((nodeId: string | null) => {
    awarenessRef.current?.setLocalStateField('selection', nodeId ? { nodeId } : null);
  }, []);

  return { peers, cursors, selections, setCursor, setSelection };
}
