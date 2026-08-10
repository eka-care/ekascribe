// "Today, 3:34 PM" / "Yesterday, 3:34 PM" / "07 Aug, 3:34 PM" from an epoch-seconds or date string
export function formatRecordedAt(raw: string): string {
  const asNumber = Number(raw);
  const date = !isNaN(asNumber) && asNumber > 0 ? new Date(asNumber * 1000) : new Date(raw);
  if (isNaN(date.getTime())) return '';

  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, ${time}`;
}
