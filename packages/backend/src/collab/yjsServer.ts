import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

// ---------------------------------------------------------------------------
// Minimal Yjs WebSocket sync server (sync + awareness protocols), with
// pluggable persistence. One shared Y.Doc per document name; all connections
// for that name converge via CRDT updates.
// ---------------------------------------------------------------------------

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const PERSIST_DEBOUNCE_MS = 2000;

/** The subset of a `ws` socket we rely on (avoids a hard dependency on ws types). */
export interface WSConn {
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  readyState: number;
  binaryType: string;
}

export interface CollabPersistence {
  load: (docName: string) => Promise<Uint8Array | null>;
  /** Persist the document. Receives the live Y.Doc so the implementation can
   *  derive both the binary state and any read-models (e.g. content JSON). */
  save: (docName: string, doc: Y.Doc) => Promise<void>;
}

interface SharedDoc {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WSConn, Set<number>>; // conn -> awareness client ids it controls
  persistTimer: ReturnType<typeof setTimeout> | null;
}

const docs = new Map<string, SharedDoc>();
let persistence: CollabPersistence | null = null;

export function setCollabPersistence(p: CollabPersistence): void {
  persistence = p;
}

/** Exposed for tests/inspection. */
export function activeDocCount(): number {
  return docs.size;
}

const WS_OPEN = 1;

function toUint8(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data as Buffer[]));
  // Node Buffer
  const buf = data as Buffer;
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function send(conn: WSConn, message: Uint8Array): void {
  if (conn.readyState !== WS_OPEN) {
    return;
  }
  try {
    conn.send(message);
  } catch {
    conn.close();
  }
}

function schedulePersist(docName: string, shared: SharedDoc): void {
  if (!persistence || shared.persistTimer) return;
  shared.persistTimer = setTimeout(() => {
    shared.persistTimer = null;
    void persistence?.save(docName, shared.doc).catch(() => {});
  }, PERSIST_DEBOUNCE_MS);
}

async function getOrCreateDoc(docName: string): Promise<SharedDoc> {
  const existing = docs.get(docName);
  if (existing) return existing;

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);
  const shared: SharedDoc = { doc, awareness, conns: new Map(), persistTimer: null };
  docs.set(docName, shared);

  if (persistence) {
    const stored = await persistence.load(docName);
    if (stored && stored.byteLength > 0) Y.applyUpdate(doc, stored, 'persistence');
  }

  // Broadcast document updates to every connection except the originator.
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    for (const conn of shared.conns.keys()) {
      if (conn !== origin) send(conn, message);
    }
    schedulePersist(docName, shared);
  });

  // Track which awareness client ids each connection controls, and broadcast.
  awareness.on(
    'update',
    (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const { added, updated, removed } = changes;
      const controlled = origin ? shared.conns.get(origin as WSConn) : undefined;
      if (controlled) {
        added.forEach((id) => controlled.add(id));
        removed.forEach((id) => controlled.delete(id));
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, added.concat(updated, removed)),
      );
      const message = encoding.toUint8Array(encoder);
      for (const conn of shared.conns.keys()) send(conn, message);
    },
  );

  return shared;
}

/**
 * Attach a freshly-opened WebSocket connection to the document `docName`.
 * Performs the initial sync handshake and wires message/close handlers.
 */
export async function handleConnection(conn: WSConn, docName: string): Promise<void> {
  conn.binaryType = 'arraybuffer';
  const shared = await getOrCreateDoc(docName);
  shared.conns.set(conn, new Set());

  conn.on('message', (data: unknown) => {
    try {
      const decoder = decoding.createDecoder(toUint8(data));
      const messageType = decoding.readVarUint(decoder);
      if (messageType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, shared.doc, conn);
        if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder));
      } else if (messageType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          shared.awareness,
          decoding.readVarUint8Array(decoder),
          conn,
        );
      }
    } catch {
      conn.close();
    }
  });

  conn.on('close', () => {
    const controlled = shared.conns.get(conn);
    shared.conns.delete(conn);
    if (controlled && controlled.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        shared.awareness,
        [...controlled],
        'connection closed',
      );
    }
    if (shared.conns.size === 0) {
      // Last client left: persist immediately and evict the in-memory doc.
      if (shared.persistTimer) clearTimeout(shared.persistTimer);
      shared.persistTimer = null;
      void persistence?.save(docName, shared.doc).catch(() => {});
      shared.awareness.destroy();
      shared.doc.destroy();
      docs.delete(docName);
    }
  });

  // 1) Initial sync step 1 (server asks the client for its state).
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, shared.doc);
  send(conn, encoding.toUint8Array(syncEncoder));

  // 2) Send existing awareness states to the newcomer.
  const states = shared.awareness.getStates();
  if (states.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(shared.awareness, [...states.keys()]),
    );
    send(conn, encoding.toUint8Array(awarenessEncoder));
  }
}
