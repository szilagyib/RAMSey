import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { analyze, minimalCutSets } from '@ramsey/engine';
import {
  markovToModelIR,
  faultTreeToModelIR,
  rbdToModelIR,
  eventTreeToModelIR,
  bowTieToModelIR,
} from '../../../src/lib/toModelIR';

const node = (id: string, data: Record<string, unknown>): Node =>
  ({ id, type: 'stateNode', position: { x: 0, y: 0 }, data }) as Node;
const edge = (id: string, source: string, target: string, data: Record<string, unknown>): Edge =>
  ({ id, source, target, data }) as Edge;

const nodes = [
  node('S0', { label: 'Up', stateType: 'operational', isInitial: true }),
  node('S1', { label: 'Down', stateType: 'failed', isInitial: false }),
];
const edges = [edge('t0', 'S0', 'S1', { rate: '0.001' }), edge('t1', 'S1', 'S0', { rate: '0.01' })];

describe('markovToModelIR', () => {
  it('maps nodes to states and edges to transitions', () => {
    const ir = markovToModelIR(nodes, edges, 1000);
    expect(ir.type).toBe('markov_chain');
    expect(ir.missionTime).toBe(1000);
    expect(ir.states.map((s) => s.id)).toEqual(['S0', 'S1']);
    expect(ir.states[0].type).toBe('operational');
    expect(ir.initialCondition).toEqual({ type: 'single', stateId: 'S0' });
    expect(ir.transitions).toHaveLength(2);
    expect(ir.transitions[0]).toMatchObject({ from: 'S0', to: 'S1', rate: 0.001 });
  });

  it('omits unparseable/blank rates', () => {
    const ir = markovToModelIR(
      [node('A', { stateType: 'operational' })],
      [edge('e', 'A', 'A', { rate: '' })],
      1,
    );
    expect('rate' in ir.transitions[0]).toBe(false);
  });

  it('end-to-end: converted diagram analyzes to the closed-form availability', async () => {
    const ir = markovToModelIR(nodes, edges, 1000);
    const res = await analyze({
      modelIR: ir,
      method: 'availability',
      options: {},
      executionTarget: 'browser',
    });
    expect(res.status).toBe('success');
    // μ/(λ+μ) = 0.01/0.011
    expect(Math.abs((res.metrics.availability as number) - 0.01 / 0.011)).toBeLessThan(1e-6);
  });
});

const ftNode = (id: string, data: Record<string, unknown>): Node =>
  ({ id, type: 't', position: { x: 0, y: 0 }, data }) as Node;
const link = (id: string, source: string, target: string): Edge =>
  ({ id, source, target, data: {} }) as Edge;

describe('faultTreeToModelIR', () => {
  it('maps an AND gate feeding the top event (edges flow input→gate→top)', async () => {
    // a→g, b→g, g→top
    const ftNodes = [
      ftNode('a', { nodeKind: 'event', eventType: 'basic', label: 'A', probability: '0.1' }),
      ftNode('b', { nodeKind: 'event', eventType: 'basic', label: 'B', probability: '0.1' }),
      ftNode('g', { nodeKind: 'gate', gateType: 'AND', label: 'G' }),
      ftNode('top', { nodeKind: 'event', eventType: 'top', label: 'Top' }),
    ];
    const ftEdges = [link('e1', 'a', 'g'), link('e2', 'b', 'g'), link('e3', 'g', 'top')];
    const ir = faultTreeToModelIR(ftNodes, ftEdges);

    const cuts = minimalCutSets(ir);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].sort()).toEqual(['a', 'b']);

    const res = await analyze({
      modelIR: ir,
      method: 'reliability',
      options: {},
      executionTarget: 'browser',
    });
    expect(Math.abs((res.metrics.probability as number) - 0.01)).toBeLessThan(1e-9);
  });
});

const rbdNode = (id: string, kind: string, extra: Record<string, unknown> = {}): Node =>
  ({
    id,
    type: 't',
    position: { x: 0, y: 0 },
    data: { nodeKind: kind, label: id, ...extra },
  }) as Node;

describe('rbdToModelIR', () => {
  const lambda = -Math.log(0.9); // R = 0.9 at t=1

  it('series of two blocks → reliability 0.81', async () => {
    const n = [
      rbdNode('IN', 'input_terminal'),
      rbdNode('b1', 'block', { failureRate: String(lambda) }),
      rbdNode('b2', 'block', { failureRate: String(lambda) }),
      rbdNode('OUT', 'output_terminal'),
    ];
    const e = [link('e1', 'IN', 'b1'), link('e2', 'b1', 'b2'), link('e3', 'b2', 'OUT')];
    const ir = rbdToModelIR(n, e, 1)!;
    expect(ir).not.toBeNull();
    const res = await analyze({
      modelIR: ir,
      method: 'reliability',
      options: {},
      executionTarget: 'browser',
    });
    expect(Math.abs((res.metrics.reliability as number) - 0.81)).toBeLessThan(1e-6);
  });

  it('parallel of two blocks → reliability 0.99', async () => {
    const n = [
      rbdNode('IN', 'input_terminal'),
      rbdNode('b1', 'block', { failureRate: String(lambda) }),
      rbdNode('b2', 'block', { failureRate: String(lambda) }),
      rbdNode('OUT', 'output_terminal'),
    ];
    const e = [
      link('e1', 'IN', 'b1'),
      link('e2', 'IN', 'b2'),
      link('e3', 'b1', 'OUT'),
      link('e4', 'b2', 'OUT'),
    ];
    const ir = rbdToModelIR(n, e, 1)!;
    const res = await analyze({
      modelIR: ir,
      method: 'reliability',
      options: {},
      executionTarget: 'browser',
    });
    expect(Math.abs((res.metrics.reliability as number) - 0.99)).toBeLessThan(1e-6);
  });

  it('emits a network (not null) for a non-series-parallel bridge topology', async () => {
    // Bridge: previously rejected by SP reduction — now analyzes via path sets.
    const n = [
      rbdNode('IN', 'input_terminal'),
      rbdNode('a', 'block', { failureRate: String(lambda) }),
      rbdNode('b', 'block', { failureRate: String(lambda) }),
      rbdNode('c', 'block', { failureRate: String(lambda) }),
      rbdNode('d', 'block', { failureRate: String(lambda) }),
      rbdNode('e', 'block', { failureRate: String(lambda) }),
      rbdNode('OUT', 'output_terminal'),
    ];
    const ed = [
      link('1', 'IN', 'a'),
      link('2', 'IN', 'b'),
      link('3', 'a', 'c'), // bridge node c
      link('4', 'b', 'c'),
      link('5', 'a', 'd'),
      link('6', 'b', 'e'),
      link('7', 'c', 'd'),
      link('8', 'c', 'e'),
      link('9', 'd', 'OUT'),
      link('10', 'e', 'OUT'),
    ];
    const ir = rbdToModelIR(n, ed, 1);
    expect(ir).not.toBeNull();
    expect(ir!.rbdNetwork).toBeDefined();
    expect(ir!.rbdNetwork!.source).toBe('IN');
    expect(ir!.rbdNetwork!.connections).toHaveLength(10);
    // It now computes a finite reliability in (0,1) instead of being rejected.
    const r = await analyze({
      modelIR: ir!,
      method: 'reliability',
      options: {},
      executionTarget: 'browser',
    });
    expect(r.status).toBe('success');
    expect(r.metrics.reliability as number).toBeGreaterThan(0);
    expect(r.metrics.reliability as number).toBeLessThan(1);
  });
});

const etNode = (id: string, data: Record<string, unknown>): Node =>
  ({ id, type: 't', position: { x: 0, y: 0 }, data }) as Node;

describe('eventTreeToModelIR', () => {
  it('builds an event-tree structure and analyzes consequence probabilities', async () => {
    const nodes = [
      etNode('IE', { nodeKind: 'initiating_event', label: 'Init', probability: '1' }),
      etNode('h', { nodeKind: 'header', label: 'Backup' }),
      etNode('ok', { nodeKind: 'consequence', label: 'OK' }),
      etNode('fail', { nodeKind: 'consequence', label: 'Fail' }),
    ];
    const edges = [
      edge('b1', 'IE', 'ok', { branchType: 'success', probability: '0.95' }),
      edge('b2', 'IE', 'fail', { branchType: 'failure', probability: '0.05' }),
    ];
    const ir = eventTreeToModelIR(nodes, edges);
    expect(ir).not.toBeNull();
    expect(ir!.eventTree?.initiatingId).toBe('IE');
    const r = await analyze({
      modelIR: ir!,
      method: 'frequency',
      options: {},
      executionTarget: 'browser',
    });
    expect(r.status).toBe('success');
    expect(Math.abs(r.contributions.consequence.OK - 0.95)).toBeLessThan(1e-9);
    expect(Math.abs(r.contributions.consequence.Fail - 0.05)).toBeLessThan(1e-9);
  });

  it('returns null without an initiating event', () => {
    expect(eventTreeToModelIR([etNode('h', { nodeKind: 'header', label: 'H' })], [])).toBeNull();
  });
});

describe('bowTieToModelIR', () => {
  it('builds a bow-tie structure and analyzes through barriers', async () => {
    const nodes = [
      etNode('T', { nodeKind: 'threat', label: 'Corrosion' }),
      etNode('PB', { nodeKind: 'preventive_barrier', label: 'Coating', effectiveness: '0.9' }),
      etNode('top', { nodeKind: 'top_event', label: 'Leak' }),
      etNode('MB', { nodeKind: 'mitigative_barrier', label: 'Bund', effectiveness: '0.8' }),
      etNode('C', { nodeKind: 'consequence', label: 'Spill' }),
    ];
    const edges = [
      edge('e1', 'T', 'PB'),
      edge('e2', 'PB', 'top'),
      edge('e3', 'top', 'MB'),
      edge('e4', 'MB', 'C'),
    ];
    const ir = bowTieToModelIR(nodes, edges);
    expect(ir).not.toBeNull();
    expect(ir!.bowTie?.topEventId).toBe('top');
    const r = await analyze({
      modelIR: ir!,
      method: 'frequency',
      options: {},
      executionTarget: 'browser',
    });
    expect(r.status).toBe('success');
    expect(Math.abs((r.metrics.top_event_probability as number) - 0.1)).toBeLessThan(1e-9);
    expect(Math.abs(r.contributions.consequence.Spill - 0.02)).toBeLessThan(1e-9);
  });

  it('returns null without a top event', () => {
    expect(bowTieToModelIR([etNode('T', { nodeKind: 'threat', label: 'T' })], [])).toBeNull();
  });
});
