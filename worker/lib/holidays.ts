// Public holiday & festival calendars, published by Google as public ICS feeds (no sign-in needed).
export interface HolidayCalendar {
  id: string; // Google calendar id
  name: string;
  group: 'Public holidays' | 'Festivals & observances';
}

export const HOLIDAY_CALENDARS: HolidayCalendar[] = [
  { id: 'en.singapore#holiday@group.v.calendar.google.com', name: 'Singapore', group: 'Public holidays' },
  { id: 'en.indian#holiday@group.v.calendar.google.com', name: 'India', group: 'Public holidays' },
  { id: 'en.malaysia#holiday@group.v.calendar.google.com', name: 'Malaysia', group: 'Public holidays' },
  { id: 'en.china#holiday@group.v.calendar.google.com', name: 'China', group: 'Public holidays' },
  { id: 'en.uk#holiday@group.v.calendar.google.com', name: 'United Kingdom', group: 'Public holidays' },
  { id: 'en.usa#holiday@group.v.calendar.google.com', name: 'United States', group: 'Public holidays' },
  { id: 'en.hinduism#holiday@group.v.calendar.google.com', name: 'Hindu festivals', group: 'Festivals & observances' },
  { id: 'en.islamic#holiday@group.v.calendar.google.com', name: 'Islamic holidays', group: 'Festivals & observances' },
  { id: 'en.christian#holiday@group.v.calendar.google.com', name: 'Christian holidays', group: 'Festivals & observances' },
  { id: 'en.judaism#holiday@group.v.calendar.google.com', name: 'Jewish holidays', group: 'Festivals & observances' },
  { id: 'en.orthodox_christianity#holiday@group.v.calendar.google.com', name: 'Orthodox Christian holidays', group: 'Festivals & observances' },
];

export function holidayIcsUrl(id: string): string {
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`;
}
