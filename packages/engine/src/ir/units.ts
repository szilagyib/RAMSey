// ---------------------------------------------------------------------------
// Time and rate unit types
// ---------------------------------------------------------------------------

export type TimeUnit = 'hours' | 'days' | 'years';
export type RateUnit = '1/h' | '1/d' | '1/y';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HOURS_PER_DAY = 24;
export const HOURS_PER_YEAR = 8760;

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/**
 * Return the multiplicative factor to convert a duration expressed in `from`
 * units into the equivalent duration in `to` units.
 *
 * Example: `getConversionFactor('days', 'hours')` returns 24.
 */
export function getConversionFactor(from: TimeUnit, to: TimeUnit): number {
  if (from === to) return 1;

  // Convert `from` into hours first (our canonical base).
  const toHours: Record<TimeUnit, number> = {
    hours: 1,
    days: HOURS_PER_DAY,
    years: HOURS_PER_YEAR,
  };

  return toHours[from] / toHours[to];
}

/**
 * Convert a time value from one unit to another.
 */
export function convertTime(value: number, from: TimeUnit, to: TimeUnit): number {
  return value * getConversionFactor(from, to);
}

/**
 * Convert a rate value from one unit to another.
 *
 * Rates are inversely proportional to time — doubling the time unit halves
 * the numeric rate.  E.g. a rate of 1/h is 24/d because there are 24 hours
 * in a day.
 */
export function convertRate(value: number, from: RateUnit, to: RateUnit): number {
  if (from === to) return value;

  const rateToTimeUnit: Record<RateUnit, TimeUnit> = {
    '1/h': 'hours',
    '1/d': 'days',
    '1/y': 'years',
  };

  const fromTime = rateToTimeUnit[from];
  const toTime = rateToTimeUnit[to];

  // Rate conversion is the inverse of time conversion:
  // If 1 day = 24 hours  then  rate_per_day = rate_per_hour * 24
  // That is, we multiply by the factor that converts the *denominator* time
  // unit from `from` to `to`.
  //
  // getConversionFactor(toTime, fromTime) gives us the number of `from`
  // time-units per `to` time-unit, which is exactly the multiplier for the rate.
  return value * getConversionFactor(toTime, fromTime);
}

/**
 * Return the rate unit that corresponds to a given time unit.
 */
export function getRateUnit(timeUnit: TimeUnit): RateUnit {
  const mapping: Record<TimeUnit, RateUnit> = {
    hours: '1/h',
    days: '1/d',
    years: '1/y',
  };
  return mapping[timeUnit];
}
