import type { ValidationResult } from '@ramsey/engine';
import type { FMEARow } from '../../types/diagram';

/**
 * Validates an array of FMEA rows.
 *
 * Rules:
 * - All text cells (item, function, failureMode, effect, actions) must be non-empty.
 * - Severity, Occurrence, and Detection scores must be integers between 1 and 10.
 */
export function validate(rows: FMEARow[]): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const warnings: ValidationResult['warnings'] = [];

  if (rows.length === 0) {
    errors.push({
      code: 'EMPTY_TABLE',
      message: 'FMEA table has no rows. Add at least one row.',
      affectedIds: [],
    });
    return { valid: false, errors, warnings };
  }

  const textFields: { key: keyof FMEARow; label: string }[] = [
    { key: 'item', label: 'Item' },
    { key: 'function', label: 'Function' },
    { key: 'failureMode', label: 'Failure Mode' },
    { key: 'effect', label: 'Effect' },
    { key: 'actions', label: 'Actions' },
  ];

  const scoreFields: { key: keyof FMEARow; label: string }[] = [
    { key: 'severity', label: 'Severity' },
    { key: 'occurrence', label: 'Occurrence' },
    { key: 'detection', label: 'Detection' },
  ];

  for (const row of rows) {
    // Check text fields are filled
    for (const { key, label } of textFields) {
      const value = row[key];
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push({
          code: 'MISSING_TEXT',
          message: `Row "${row.id}": ${label} must not be empty.`,
          affectedIds: [row.id],
        });
      }
    }

    // Check score fields are within 1-10
    for (const { key, label } of scoreFields) {
      const value = row[key] as number;
      if (!Number.isInteger(value) || value < 1 || value > 10) {
        errors.push({
          code: 'INVALID_SCORE',
          message: `Row "${row.id}": ${label} must be an integer between 1 and 10.`,
          affectedIds: [row.id],
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
