export const BIRTHDAY_LOOKAHEAD_DAYS = 90;

export function isUpcomingBirthday(daysUntil: number): boolean {
  return daysUntil >= 0 && daysUntil <= BIRTHDAY_LOOKAHEAD_DAYS;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function istCalendarDate(now: Date): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

function birthdayInYear(year: number, month: number, day: number): Date {
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // Celebrate 29 February birthdays on 28 February in non-leap years.
  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfMonth)));
}

export function nextBirthdayDetails(dateOfBirth: Date, now = new Date()) {
  const today = istCalendarDate(now);
  const birthMonth = dateOfBirth.getUTCMonth();
  const birthDay = dateOfBirth.getUTCDate();
  let birthdayYear = today.getUTCFullYear();
  let nextBirthday = birthdayInYear(birthdayYear, birthMonth, birthDay);

  if (nextBirthday.getTime() < today.getTime()) {
    birthdayYear += 1;
    nextBirthday = birthdayInYear(birthdayYear, birthMonth, birthDay);
  }

  const daysUntil = Math.round((nextBirthday.getTime() - today.getTime()) / DAY_MS);
  return {
    daysUntil,
    isToday: daysUntil === 0,
    age: birthdayYear - dateOfBirth.getUTCFullYear(),
  };
}
