import type { Parameter, ValueRef } from '../ir/schema.js';
import type { Warning } from './interface.js';

/**
 * Resolve a ValueRef to a number.
 * - number          → itself
 * - { param: name } → looked up in `parameters`
 * - { expr: ... }   → not supported (records a warning, returns fallback)
 * Missing/unresolvable refs record a warning and return `fallback`.
 */
export function resolveValue(
  ref: ValueRef | undefined,
  parameters: Parameter[],
  warnings: Warning[],
  label = 'value',
  fallback = 0,
): number {
  if (ref === undefined || ref === null) {
    warnings.push({ code: 'missing_value', message: `Missing ${label}; using ${fallback}` });
    return fallback;
  }
  if (typeof ref === 'number') return ref;

  if ('param' in ref) {
    const p = parameters.find((x) => x.name === ref.param);
    if (!p) {
      warnings.push({
        code: 'unknown_parameter',
        message: `Unknown parameter '${ref.param}' for ${label}; using ${fallback}`,
      });
      return fallback;
    }
    return p.value;
  }

  // { expr: ... } — expression evaluation is out of scope for this pass.
  warnings.push({
    code: 'expr_unsupported',
    message: `Expression refs are not supported (${label}); using ${fallback}`,
  });
  return fallback;
}
