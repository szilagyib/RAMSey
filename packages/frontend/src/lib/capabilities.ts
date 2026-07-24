import { useEffect, useState } from 'react';
import { apiUrl } from '../config/runtime';

/**
 * Deployment capabilities: which optional features the backend has enabled.
 * Fail-closed — until the backend confirms a capability, the UI treats it as
 * off, so an unconfigured deployment hides features instead of breaking them.
 */
export interface Capabilities {
  aiChat: boolean;
  /**
   * Where chat data is sent, for the panel's privacy notice. Null when AI chat
   * is off. The UI must render this rather than naming a provider itself — a
   * deployment can point at any OpenAI-compatible host.
   */
  aiProviderLabel: string | null;
  serverAnalysis: boolean;
  googleOAuth: boolean;
}

export const NO_CAPABILITIES: Capabilities = {
  aiChat: false,
  aiProviderLabel: null,
  serverAnalysis: false,
  googleOAuth: false,
};

/**
 * One probe. Returns null when the probe ITSELF failed, which is different from
 * a deployment that simply has nothing enabled — the caller must not treat a
 * dead request as "these features are off".
 */
async function probe(): Promise<Capabilities | null> {
  try {
    const res = await fetch(apiUrl('/api/capabilities'), { credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<Capabilities>;
    return {
      aiChat: body.aiChat === true,
      aiProviderLabel: typeof body.aiProviderLabel === 'string' ? body.aiProviderLabel : null,
      serverAnalysis: body.serverAnalysis === true,
      googleOAuth: body.googleOAuth === true,
    };
  } catch {
    // Includes a non-JSON body: a stale bundle can address the wrong origin and
    // get index.html back, which must read as "probe failed", not "all off".
    return null;
  }
}

/** Probe, retrying once — a single blip must not disable a feature. */
export async function fetchCapabilities(): Promise<Capabilities> {
  return (await probe()) ?? (await probe()) ?? NO_CAPABILITIES;
}

// One fetch per page load, shared by every consumer.
let cached: Promise<Capabilities> | null = null;

function loadCapabilities(): Promise<Capabilities> {
  cached ??= (async () => {
    const caps = (await probe()) ?? (await probe());
    // Never remember a failure: cached forever meant one dead request hid every
    // optional feature for the rest of the page load, even once the API was
    // back. Clearing it lets the next mount try again.
    if (caps === null) {
      cached = null;
      return NO_CAPABILITIES;
    }
    return caps;
  })();
  return cached;
}

export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>(NO_CAPABILITIES);
  useEffect(() => {
    let alive = true;
    loadCapabilities().then((c) => {
      if (alive) setCaps(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return caps;
}

/** Test hook: reset the module-level cache. */
export function resetCapabilitiesCache(): void {
  cached = null;
}
