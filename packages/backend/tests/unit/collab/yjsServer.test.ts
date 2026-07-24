import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import {
  handleConnection,
  setCollabPersistence,
  type WSConn,
} from '../../../src/collab/yjsServer.js';

const MESSAGE_SYNC = 0;

interface MockConn extends WSConn {
  sent: Uint8Array[];
  emit: (event: string, ...args: unknown[]) => void;
}

function mockConn(): MockConn {
  const handlers: Record<string, (...a: unknown[]) => void> = {};
  return {
    sent: [],
    readyState: 1,
    binaryType: 'arraybuffer',
    send(data: Uint8Array) {
      this.sent.push(data);
    },
    close() {},
    on(event: string, cb: (...a: unknown[]) => void) {
      handlers[event] = cb;
    },
    emit(event: string, ...args: unknown[]) {
      handlers[event]?.(...args);
    },
  };
}

/** Encode a Yjs update as a sync-protocol message. */
function syncUpdateMessage(update: Uint8Array): Uint8Array {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MESSAGE_SYNC);
  syncProtocol.writeUpdate(enc, update);
  return encoding.toUint8Array(enc);
}

/** Apply any sync messages a connection received to a client doc. */
function applySyncMessages(messages: Uint8Array[], clientDoc: Y.Doc): void {
  for (const msg of messages) {
    const dec = decoding.createDecoder(msg);
    if (decoding.readVarUint(dec) !== MESSAGE_SYNC) continue;
    syncProtocol.readSyncMessage(dec, encoding.createEncoder(), clientDoc, 'remote');
  }
}

describe('yjs sync server', () => {
  it('propagates one client’s update to another connection on the same doc', async () => {
    setCollabPersistence({ load: async () => null, save: async () => {} });

    const connA = mockConn();
    const connB = mockConn();
    await handleConnection(connA, 'diagram-sync-1');
    await handleConnection(connB, 'diagram-sync-1');

    // Client A makes an edit and sends the resulting update to the server.
    const clientA = new Y.Doc();
    let update: Uint8Array | null = null;
    clientA.on('update', (u: Uint8Array) => (update = u));
    clientA.getMap('nodes').set('n1', 'operational');
    expect(update).not.toBeNull();

    connB.sent = []; // ignore the initial sync handshake
    connA.emit('message', syncUpdateMessage(update!));

    // The server should have broadcast the change to connB (but not back to A).
    const clientB = new Y.Doc();
    applySyncMessages(connB.sent, clientB);
    expect(clientB.getMap('nodes').get('n1')).toBe('operational');
  });

  it('seeds a new doc from persisted state', async () => {
    // Pre-build a persisted update.
    const seed = new Y.Doc();
    seed.getMap('nodes').set('seeded', true);
    const stored = Y.encodeStateAsUpdate(seed);
    setCollabPersistence({ load: async () => stored, save: async () => {} });

    const conn = mockConn();
    await handleConnection(conn, 'diagram-seeded-1');

    // The server's first message (syncStep1) carries its state vector; reply with step2
    // and confirm the seeded value reaches a fresh client.
    const client = new Y.Doc();
    applySyncMessages(conn.sent, client);
    // readSyncMessage on step1 produces a step2 reply but doesn't populate the client;
    // instead request the full state explicitly:
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(enc, client);
    conn.sent = [];
    conn.emit('message', encoding.toUint8Array(enc));
    applySyncMessages(conn.sent, client);
    expect(client.getMap('nodes').get('seeded')).toBe(true);
  });
});
