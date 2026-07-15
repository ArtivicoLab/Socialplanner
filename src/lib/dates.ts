// ALL date math for the app goes through this module (spec §2).
// Dates are stored as plain ISO calendar dates (yyyy-mm-dd), no time component.
// Times only exist on Calendar reminder events.

import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDaysInMonth,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

/** Parse a yyyy-mm-dd string as a LOCAL date (avoids UTC off-by-one). */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Format a local Date as yyyy-mm-dd. */
export function toISO(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function todayISO(): string {
  return toISO(new Date());
}

export function isValidISO(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso);
}

export const addDaysISO = (iso: string, n: number): string =>
  toISO(addDays(fromISO(iso), n));

export const addMonthsISO = (iso: string, n: number): string =>
  toISO(addMonths(fromISO(iso), n));

export const addYearsISO = (iso: string, n: number): string =>
  toISO(addYears(fromISO(iso), n));

export function daysBetween(aIso: string, bIso: string): number {
  return differenceInCalendarDays(fromISO(bIso), fromISO(aIso));
}

export function sameISO(a: string, b: string): boolean {
  return a === b;
}

export function isOverdueISO(dueIso: string, refIso = todayISO()): boolean {
  if (!dueIso) return false;
  return daysBetween(refIso, dueIso) < 0;
}

export function isTodayISO(iso: string, refIso = todayISO()): boolean {
  return iso === refIso;
}

/** Human due label used across list rows. */
export function dueLabel(iso: string, refIso = todayISO()): string {
  if (!iso) return "";
  const diff = daysBetween(refIso, iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff < 7) return `In ${diff}d`;
  return format(fromISO(iso), "MMM d");
}

export function monthTitle(iso: string): string {
  return format(fromISO(iso), "MMMM yyyy");
}

export function weekdayShort(iso: string): string {
  return format(fromISO(iso), "EEE");
}

export function dayNum(iso: string): number {
  return fromISO(iso).getDate();
}

/** Grid of days covering the month `iso` falls in, padded to full weeks. */
export function monthGridISO(iso: string, weekStart: 0 | 1): string[] {
  const base = fromISO(iso);
  const gridStart = startOfWeek(startOfMonth(base), { weekStartsOn: weekStart });
  const gridEnd = endOfWeek(endOfMonth(base), { weekStartsOn: weekStart });
  return eachDayOfInterval({ start: gridStart, end: gridEnd }).map(toISO);
}

export function weekDaysISO(iso: string, weekStart: 0 | 1): string[] {
  const s = startOfWeek(fromISO(iso), { weekStartsOn: weekStart });
  return Array.from({ length: 7 }, (_, i) => toISO(addDays(s, i)));
}

/** Every calendar day in the month `iso` falls in — no padding from adjacent months. */
export function daysInMonthISO(iso: string): string[] {
  const start = startOfMonth(fromISO(iso));
  const count = getDaysInMonth(start);
  return Array.from({ length: count }, (_, i) => toISO(addDays(start, i)));
}

export function endOfMonthISO(iso: string): string {
  return toISO(endOfMonth(fromISO(iso)));
}

export function inSameMonth(iso: string, refIso: string): boolean {
  const a = fromISO(iso);
  const b = fromISO(refIso);
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

export {
  isSameDay,
  parseISO,
  getDaysInMonth,
  startOfMonth,
  endOfMonth,
  format,
};
