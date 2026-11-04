import { expect, it } from 'vitest';
import { formatDateInput, parseDateInput } from './admin-dates';

it.each([
  ['31.10.2026', '2026-10-31'], ['1.11.2026', '2026-11-01'],
  ['01/11/2026', '2026-11-01'], ['01-11-2026', '2026-11-01'],
  ['01112026', '2026-11-01'], [' 2026-11-01 ', '2026-11-01'],
  ['29.02.2028', '2028-02-29'], ['29.02.2000', '2000-02-29'],
])('accepts a real date entered as %s', (input, result) => {
  expect(parseDateInput(input)).toBe(result);
});

it.each(['', '31.04.2026', '29.02.2026', '29.02.2100', '00.11.2026', '01.13.2026', '2026-02-30', '01.11.26', 'abc'])('rejects an invalid date: %s', input => {
  expect(parseDateInput(input)).toBeNull();
});

it('round-trips the year boundary without using the machine time zone', () => {
  for (const date of ['2026-12-31', '2027-01-01', '2028-02-29']) expect(parseDateInput(formatDateInput(date))).toBe(date);
});
