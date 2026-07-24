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

describe('probe resilience', () => {
  // A phone that drops one request must not lose Google sign-in for the session.
  it('retries once, so a single failure does not disable features', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(okResponse({ googleOAuth: true }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchCapabilities()).toMatchObject({ googleOAuth: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // A stale bundle can address the wrong origin and be served index.html; that
  // is a broken probe, not a deployment with everything switched off.
  it('treats a non-JSON body as a failed probe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      })),
    );
    expect(await fetchCapabilities()).toEqual(NO_CAPABILITIES);
  });
});

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
