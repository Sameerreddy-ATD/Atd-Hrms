export const BIRTHDAY_LOOKAHEAD_DAYS = 60;

export function upcomingBirthdays<T extends { daysUntil: number }>(items: T[]): T[] {
  return items.filter((item) => item.daysUntil >= 0 && item.daysUntil <= BIRTHDAY_LOOKAHEAD_DAYS);
}

export function futureBirthdays<T extends { daysUntil: number }>(items: T[]): T[] {
  return upcomingBirthdays(items).filter((item) => item.daysUntil > 0);
}

export function todaysBirthdays<T extends { isToday: boolean }>(items: T[]): T[] {
  return items.filter((item) => item.isToday);
}
