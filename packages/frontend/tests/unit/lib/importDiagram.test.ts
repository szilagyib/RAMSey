import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDiagramJson } from '../../../src/lib/importDiagram';

const examplePath = resolve(
  __dirname,
  '../../../../../examples/markov-redundant-power.json',
);

describe('parseDiagramJson', () => {
  it('accepts the shipped example file (validates the artifact)', () => {
    const result = parseDiagramJson(readFileSync(examplePath, 'utf-8'));
    expect(result).not.toHaveProperty('error');
    if ('error' in result) return;
    expect(result.type).toBe('markov_chain');
    expect(result.name).toContain('Redundant power supply');
    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(5);
    // All four Markov state types are showcased, with exactly one initial
    // and one absorbing state (required for MTTF).
    const types = result.nodes.map((n) => (n.data as { stateType: string }).stateType);
    expect(new Set(types)).toEqual(
      new Set(['operational', 'degraded', 'failed', 'absorbing']),
    );
    expect(
      result.nodes.filter((n) => (n.data as { isInitial?: boolean }).isInitial),
    ).toHaveLength(1);
    // Every transition carries a numeric rate.
    for (const e of result.edges) {
      const rate = Number((e.data as { rate: string }).rate);
      expect(rate).toBeGreaterThan(0);
    }
  });

  it('rejects invalid JSON', () => {
    expect(parseDiagramJson('{nope')).toEqual({ error: 'Not valid JSON.' });
  });

  it('treats files without schemaVersion as v1 (pre-versioning exports)', () => {
    const legacy = JSON.stringify({
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    });
    expect(parseDiagramJson(legacy)).not.toHaveProperty('error');
  });

  it('refuses files from a newer format version', () => {
    const future = JSON.stringify({
      schemaVersion: 2,
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    });
    const result = parseDiagramJson(future);
    expect(result).toHaveProperty('error');
    if ('error' in result) expect(result.error).toContain('format version 2');
  });

  it('rejects a malformed schemaVersion', () => {
    const bad = JSON.stringify({
      schemaVersion: 'one',
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    });
    expect(parseDiagramJson(bad)).toEqual({ error: 'Invalid schemaVersion.' });
  });

  it('rejects a file without nodes/edges arrays', () => {
    expect(parseDiagramJson('{"nodes": 5}')).toHaveProperty('error');
    expect(parseDiagramJson('"hello"')).toHaveProperty('error');
  });

  it('rejects an empty diagram', () => {
    expect(parseDiagramJson('{"nodes": [], "edges": []}')).toEqual({
      error: 'The file contains no nodes.',
    });
  });

  it('rejects malformed nodes', () => {
    const bad = JSON.stringify({ nodes: [{ id: 'a' }], edges: [] });
    expect(parseDiagramJson(bad)).toHaveProperty('error');
  });

  it('rejects edges that reference missing nodes', () => {
    const bad = JSON.stringify({
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {} }],
      edges: [{ id: 'e1', source: 'a', target: 'ghost' }],
    });
    const result = parseDiagramJson(bad);
    expect(result).toHaveProperty('error');
    if ('error' in result) expect(result.error).toContain('missing node');
  });

  it('rejects oversized diagrams', () => {
    const nodes = Array.from({ length: 601 }, (_, i) => ({
      id: `n${i}`,
      position: { x: 0, y: 0 },
      data: {},
    }));
    expect(parseDiagramJson(JSON.stringify({ nodes, edges: [] }))).toEqual({
      error: 'The diagram is too large to import.',
    });
  });
});
