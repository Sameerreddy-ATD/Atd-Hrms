const messages = [
  "{name}, cheers to {age} years of ideas, effort, and memorable moments.",
  "Happy birthday, {name}. You have completed {age} wonderful years on Earth.",
  "{age} trips around the sun look good on you, {name}. Happy birthday.",
  "Celebrating {name} and {age} years of making a difference.",
  "Happy level {age}, {name}. May the year ahead be your best one yet.",
  "{name}, today marks {age} years of your one-of-a-kind journey.",
  "A big birthday cheer for {name}, celebrating {age} years today.",
  "Here is to {name}, {age} years young and still moving forward.",
  "Happy birthday, {name}. May year {age} bring fresh wins and happy moments.",
  "{name} has been brightening the world for {age} years today.",
  "Celebrating {age} years of {name}. Wishing you a brilliant birthday.",
  "Happy birthday to {name}, now proudly {age} years awesome.",
  "{name}, your {age}th chapter starts today. Make it a great one.",
  "Warm wishes to {name} on completing {age} remarkable years.",
  "Today belongs to {name}, celebrating {age} years around the sun.",
  "Happy birthday, {name}. Here is to {age} years and many new adventures.",
  "{name}, may your {age}th year be full of good health and proud moments.",
  "A joyful birthday salute to {name}, celebrating age {age}.",
  "{age} years, countless memories, and plenty more ahead for {name}.",
  "Happy birthday, {name}. The world has enjoyed your company for {age} years.",
  "Celebrating the energy and spirit of {name} on birthday number {age}.",
  "{name}, congratulations on {age} meaningful years on this beautiful planet.",
  "Best birthday wishes to {name}, welcoming a bright new year at {age}.",
  "{name} turns {age} today. Let the celebrations and good times begin.",
  "Happy birthday, {name}. Your journey of {age} years is worth celebrating.",
  "A wonderful day for {name}, now celebrating {age} years of life.",
  "{name}, may age {age} bring you more reasons to smile every day.",
  "The team celebrates {name} and an amazing {age} years today.",
  "Happy {age}th birthday, {name}. Keep inspiring everyone around you.",
  "{name}, another year wiser, stronger, and now proudly {age}.",
  "Sending bright birthday wishes to {name} for year number {age}.",
  "{age} candles and a day full of appreciation for {name}.",
  "Happy birthday, {name}. Celebrate all that your {age} years have created.",
  "{name}, welcome to a fresh chapter after {age} memorable years.",
  "Today we celebrate {name}, the person behind {age} years of great stories.",
  "May this milestone at {age} be a joyful one for {name}. Happy birthday.",
  "{name} is {age} today. Wishing you confidence, happiness, and success.",
  "Happy birthday, {name}. May your {age}th year exceed every expectation.",
  "A very happy birthday to {name}, celebrating {age} years with us.",
  "{name}, you have made {age} journeys around the sun. Enjoy this one.",
  "Celebration mode is on for {name}, who turns {age} today.",
  "Happy birthday, {name}. Here is to the lessons and laughter of {age} years.",
  "{name}, may your day at {age} be as special as the impact you make.",
  "The calendar saved today for {name} and birthday number {age}.",
  "{age} years of growth deserve a wonderful celebration, {name}.",
  "Happy birthday, {name}. Step into year {age} with a smile.",
  "Today is a fresh milestone for {name}: {age} excellent years.",
  "Birthday wishes are heading to {name}, celebrating {age} years today.",
  "{name}, your story is {age} years strong and still getting better.",
  "Many happy returns to {name} on completing {age} years on Earth.",
] as const;

function hash(value: string) {
  let result = 0;
  for (const character of value) result = (result * 31 + character.charCodeAt(0)) >>> 0;
  return result;
}

const genderOpenings = {
  FEMALE: [
    "{name} shines with the calm beauty of moonlight.",
    "Like the moon, {name} brings a quiet glow wherever she goes.",
    "{name} carries strength, grace, and a light all her own.",
    "Today we celebrate the bright spirit and graceful strength of {name}.",
  ],
  MALE: [
    "{name} brings steady strength and positive energy to the journey.",
    "Today we celebrate the drive, character, and spirit of {name}.",
    "{name} steps into another year with strength and purpose.",
    "Here is to the confidence, kindness, and determination of {name}.",
  ],
  PREFER_NOT_TO_SAY: [
    "{name} brings a special light and positive energy to the team.",
    "Today we celebrate the wonderful person and spirit of {name}.",
    "{name} makes the journey brighter simply by being themselves.",
    "Here is to the unique energy and valued presence of {name}.",
  ],
} as const;

export function birthdayMessage(
  employeeId: string,
  name: string,
  age: number,
  year: number,
  gender?: keyof typeof genderOpenings | null,
) {
  const index = (hash(employeeId) + year) % messages.length;
  const openingOptions = genderOpenings[gender ?? "PREFER_NOT_TO_SAY"];
  const opening = openingOptions[(hash(employeeId) + year) % openingOptions.length].replaceAll(
    "{name}",
    name,
  );
  const main = messages[index].replaceAll("{name}", name).replaceAll("{age}", String(age));
  return `${opening} ${main}`;
}
