/**
 * Canonical EventType classification for Attendance Core.
 * Prefer these helpers over scattered `type === OFFICE_IN || ...` checks.
 */
import { EventType } from "@prisma/client";

const CHECK_IN = new Set<EventType>([
  EventType.OFFICE_IN,
  EventType.BRANCH_IN,
  EventType.FIELD_CHECK_IN,
  EventType.CLIENT_CHECK_IN,
  EventType.BREAK_IN,
]);

const CHECK_OUT = new Set<EventType>([
  EventType.OFFICE_OUT,
  EventType.BRANCH_OUT,
  EventType.FIELD_CHECK_OUT,
  EventType.CLIENT_CHECK_OUT,
  EventType.BREAK_OUT,
]);

const BREAK = new Set<EventType>([EventType.BREAK_IN, EventType.BREAK_OUT]);

export function isCheckInEvent(type: EventType): boolean {
  return CHECK_IN.has(type);
}

export function isCheckOutEvent(type: EventType): boolean {
  return CHECK_OUT.has(type);
}

export function isBreakEvent(type: EventType): boolean {
  return BREAK.has(type);
}

export function isPunchEvent(type: EventType): boolean {
  return isCheckInEvent(type) || isCheckOutEvent(type);
}

export const checkInEventTypes = [...CHECK_IN];
export const checkOutEventTypes = [...CHECK_OUT];
export const punchEventTypes = [...CHECK_IN, ...CHECK_OUT];
