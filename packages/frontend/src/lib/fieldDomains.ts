/**
 * Numeric domains for reliability fields.
 *
 * These values are stored as strings (blank = "not specified yet"), so the
 * property panel cannot infer them from the JS type — it would render a
 * probability as a free-text box. This map says which fields are numeric and
 * what range is meaningful, so the panel can render a number input and explain
 * a bad value instead of silently accepting it.
 *
 * Ranges follow standard practice:
 *  - Probabilities and barrier effectiveness are dimensionless fractions in
 *    [0, 1] (effectiveness is commonly given as 1 − PFD, or as a percentage —
 *    we use the fraction, matching how probabilities are entered elsewhere).
 *  - Failure/repair/transition rates are per unit time: non-negative and NOT
 *    capped at 1 (a rate of 5 per hour is perfectly valid).
 */
export interface NumericDomain {
  min: number;
  /** Absent = unbounded above. */
  max?: number;
  /** Shown under the field when the entered value is outside the domain. */
  message: string;
}

export const NUMERIC_FIELDS: Record<string, NumericDomain> = {
  probability: { min: 0, max: 1, message: 'Enter a probability between 0 and 1.' },
  effectiveness: { min: 0, max: 1, message: 'Enter an effectiveness between 0 and 1.' },
  rate: { min: 0, message: 'Enter a rate of 0 or more (events per unit time).' },
  failureRate: { min: 0, message: 'Enter a failure rate of 0 or more (events per unit time).' },
  repairRate: { min: 0, message: 'Enter a repair rate of 0 or more (events per unit time).' },
};

/**
 * Validate one field value. Returns an error message, or null when the value is
 * acceptable — blank included, since these fields are optional until analysis.
 */
export function validateNumericField(key: string, value: unknown): string | null {
  const domain = NUMERIC_FIELDS[key];
  if (!domain) return null;

  const text = String(value ?? '').trim();
  if (text === '') return null;

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return domain.message;
  if (parsed < domain.min) return domain.message;
  if (domain.max !== undefined && parsed > domain.max) return domain.message;
  return null;
}
