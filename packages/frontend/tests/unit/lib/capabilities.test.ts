import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchCapabilities,
  resetCapabilitiesCache,
  NO_CAPABILITIES,
} from '../../../src/lib/capabilities';

afterEach(() => {
  vi.unstubAllGlobals();
  resetCapabilitiesCache();
});

const okResponse = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe('fetchCapabilities', () => {
  it('parses enabled capabilities', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        okResponse({
          aiChat: true,
          aiProviderLabel: 'OpenAI',
          serverAnalysis: true,
          googleOAuth: true,
        }),
      ),
    );
    expect(await fetchCapabilities()).toEqual({
      aiChat: true,
      aiProviderLabel: 'OpenAI',
      serverAnalysis: true,
      googleOAuth: true,
    });
  });

  // The label drives a privacy notice, so a non-string must not reach the UI.
  it('drops a non-string provider label', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse({ aiChat: true, aiProviderLabel: 42 })),
    );
    expect(await fetchCapabilities()).toMatchObject({ aiChat: true, aiProviderLabel: null });
  });

  it('fails closed on non-boolean / missing fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse({ aiChat: 'yes' })),
    );
    expect(await fetchCapabilities()).toEqual(NO_CAPABILITIES);
  });

  it('fails closed on HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }) as Response),
    );
    expect(await fetchCapabilities()).toEqual(NO_CAPABILITIES);
  });

  it('fails closed when the request throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    expect(await fetchCapabilities()).toEqual(NO_CAPABILITIES);
  });
});
