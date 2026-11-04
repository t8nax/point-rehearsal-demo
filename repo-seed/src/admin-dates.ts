export function formatDateInput(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

export function parseDateInput(value: string): string | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const local = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  const compact = /^(\d{2})(\d{2})(\d{4})$/.exec(text);
  const parts = local || compact;
  if (!iso && !parts) return null;
  const year = Number(iso ? iso[1] : parts![3]);
  const month = Number(iso ? iso[2] : parts![2]);
  const day = Number(iso ? iso[3] : parts![1]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
