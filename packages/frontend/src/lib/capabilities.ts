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

export async function fetchCapabilities(): Promise<Capabilities> {
  try {
    const res = await fetch(apiUrl('/api/capabilities'), { credentials: 'include' });
    if (!res.ok) return NO_CAPABILITIES;
    const body = (await res.json()) as Partial<Capabilities>;
    return {
      aiChat: body.aiChat === true,
      aiProviderLabel: typeof body.aiProviderLabel === 'string' ? body.aiProviderLabel : null,
      serverAnalysis: body.serverAnalysis === true,
      googleOAuth: body.googleOAuth === true,
    };
  } catch {
    return NO_CAPABILITIES;
  }
}

// One fetch per page load, shared by every consumer.
let cached: Promise<Capabilities> | null = null;

export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>(NO_CAPABILITIES);
  useEffect(() => {
    let alive = true;
    cached ??= fetchCapabilities();
    cached.then((c) => {
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
