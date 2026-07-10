export const BIRTHDAY_LOOKAHEAD_DAYS = 60;

export function isUpcomingBirthday(daysUntil: number): boolean {
  return daysUntil >= 0 && daysUntil <= BIRTHDAY_LOOKAHEAD_DAYS;
}
