import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper conflict resolution.
 * Combines clsx for conditional classes with tailwind-merge for deduplication.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Whether `key` is one of `obj`'s own keys, narrowing it to that type.
 *
 * Not `key in obj`: that also answers yes to everything inherited from
 * Object.prototype, so a sub-type named "constructor" or "toString" would pass
 * for a real one and look up a function instead of a value.
 */
export function hasOwnKey<T extends object>(obj: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
