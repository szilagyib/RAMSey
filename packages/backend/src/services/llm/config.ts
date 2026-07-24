/**
 * Resolves which LLM provider this deployment talks to, from env.
 *
 * Resolution is total and side-effect free — it returns an error instead of
 * throwing — so `/api/capabilities` can ask "is AI usable?" on every request and
 * a misconfigured deployment degrades to "AI chat unavailable" rather than
 * failing to boot. That matches how a missing API key already behaves.
 */
import { limits } from '../../config/limits.js';
import { parseBooleanEnv } from '../../config/featureFlags.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAiProvider } from './openai.js';
import type { LlmProvider, LlmProviderId } from './provider.js';

export interface LlmConfig {
  provider: LlmProviderId;
  apiKey: string;
  model: string;
  baseURL?: string;
  /**
   * Where diagram data is actually sent, for the chat panel's privacy notice.
   * Never a bare provider name when `AI_BASE_URL` points somewhere else.
   */
  label: string;
}

export type LlmConfigResult = { ok: true; config: LlmConfig } | { ok: false; error: string };

type Env = Record<string, string | undefined>;

const PROVIDER_LABELS: Record<LlmProviderId, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
};

export function resolveLlmConfig(env: Env): LlmConfigResult {
  // Explicit kill-switch: one var turns AI chat off regardless of keys or model,
  // so an operator can disable it (incident, cost spike) without touching
  // credentials. Any obvious "off" value disables; absent or anything else
  // leaves the feature driven by whether a valid provider config resolves.
  if (!parseBooleanEnv(env.AI_CHAT_ENABLED, true)) {
    return { ok: false, error: 'AI chat is disabled via AI_CHAT_ENABLED.' };
  }

  const provider = resolveProvider(env.AI_PROVIDER);
  if (!provider) {
    return { ok: false, error: `AI_PROVIDER "${env.AI_PROVIDER}" is not supported.` };
  }

  // ANTHROPIC_API_KEY keeps working on its own, so deployments that predate
  // AI_PROVIDER need no config change.
  const apiKey = env.AI_API_KEY || (provider === 'anthropic' ? env.ANTHROPIC_API_KEY : undefined);
  if (!apiKey) {
    const expected = provider === 'anthropic' ? 'AI_API_KEY or ANTHROPIC_API_KEY' : 'AI_API_KEY';
    return { ok: false, error: `AI chat is not configured. Set ${expected}.` };
  }

  // Anthropic has a sensible house default; an OpenAI-compatible endpoint could
  // serve anything, so the model has to be named explicitly.
  const model = env.AI_MODEL || (provider === 'anthropic' ? limits.chat.model : undefined);
  if (!model) {
    return { ok: false, error: `AI_MODEL is required for the ${provider} provider.` };
  }

  const baseURL = env.AI_BASE_URL || undefined;
  return {
    ok: true,
    config: {
      provider,
      apiKey,
      model,
      baseURL,
      label: resolveLabel(env.AI_PROVIDER_LABEL, provider, baseURL),
    },
  };
}

export function createLlmProvider(config: LlmConfig): LlmProvider {
  const opts = { apiKey: config.apiKey, ...(config.baseURL ? { baseURL: config.baseURL } : {}) };
  return config.provider === 'openai' ? new OpenAiProvider(opts) : new AnthropicProvider(opts);
}

/**
 * Capability probe for `/api/capabilities`. Returns the destination label so the
 * UI can name it, and never leaks the key or the resolution error.
 */
export function describeAiConfig(env: Env): { configured: boolean; label: string | null } {
  const result = resolveLlmConfig(env);
  return result.ok
    ? { configured: true, label: result.config.label }
    : { configured: false, label: null };
}

function resolveProvider(raw: string | undefined): LlmProviderId | null {
  const value = (raw || 'anthropic').toLowerCase();
  return value === 'anthropic' || value === 'openai' ? value : null;
}

/**
 * A custom base URL means the data goes to that host, not to the provider whose
 * wire format is being spoken — labelling an OpenRouter or self-hosted endpoint
 * "OpenAI" would make the panel's privacy notice untrue.
 */
function resolveLabel(
  override: string | undefined,
  provider: LlmProviderId,
  baseURL: string | undefined,
): string {
  if (override) return override;
  if (!baseURL) return PROVIDER_LABELS[provider];
  try {
    return new URL(baseURL).hostname;
  } catch {
    return baseURL;
  }
}
