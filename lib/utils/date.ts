export function formatShortDate(input: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (match) {
    const [, year, month, day] = match;
    return `${month}/${day}/${year}`;
  }

  return input;
}
