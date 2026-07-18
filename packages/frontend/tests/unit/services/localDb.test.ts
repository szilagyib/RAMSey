import { beforeEach, describe, expect, it } from 'vitest';
import { localDb } from '../../../src/services/localDb';

const STORAGE_KEY = 'ramsey_local_db';

describe('localDb storage validation', () => {
  beforeEach(() => localStorage.clear());

  it('loads a valid stored database', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        projects: {
          p1: {
            id: 'p1',
            name: 'Cooling water',
            ownerId: 'local',
            ownerType: 'user',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        diagrams: {
          'p1/d1': {
            id: 'd1',
            projectId: 'p1',
            name: 'Pump RBD',
            type: 'reliability_block_diagram',
            content: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
    );

    await expect(localDb.projects.list()).resolves.toMatchObject({
      data: [{ id: 'p1', name: 'Cooling water' }],
    });
    await expect(localDb.diagrams.list('p1')).resolves.toMatchObject({
      data: [{ id: 'd1', name: 'Pump RBD' }],
    });
  });

  it.each([
    ['malformed JSON', '{'],
    ['null', 'null'],
    ['an array', '[]'],
    ['a missing schema', '{}'],
    ['non-record collections', '{"projects":[],"diagrams":{}}'],
    ['an invalid project', '{"projects":{"p1":null},"diagrams":{}}'],
    ['an invalid diagram', '{"projects":{},"diagrams":{"p1/d1":null}}'],
  ])('falls back to an empty database for %s', async (_label, stored) => {
    localStorage.setItem(STORAGE_KEY, stored);

    await expect(localDb.projects.list()).resolves.toEqual({ data: [] });
    await expect(localDb.diagrams.list('p1')).resolves.toEqual({ data: [] });
  });

  it('can save new data after recovering from invalid storage', async () => {
    localStorage.setItem(STORAGE_KEY, 'null');

    const created = await localDb.projects.create({ name: 'Recovered project' });

    await expect(localDb.projects.list()).resolves.toMatchObject({
      data: [{ id: created.data.id, name: 'Recovered project' }],
    });
  });

  it('revalidates storage when another writer changes the payload', async () => {
    localStorage.setItem(STORAGE_KEY, '{"projects":{},"diagrams":{}}');
    await expect(localDb.projects.list()).resolves.toEqual({ data: [] });

    localStorage.setItem(STORAGE_KEY, 'null');
    await expect(localDb.projects.list()).resolves.toEqual({ data: [] });

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        projects: {
          p1: {
            id: 'p1',
            name: 'External project',
            ownerId: 'local',
            ownerType: 'user',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        },
        diagrams: {},
      }),
    );
    await expect(localDb.projects.list()).resolves.toMatchObject({
      data: [{ id: 'p1', name: 'External project' }],
    });
  });
});
