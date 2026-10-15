// Display formatting shared by templates, CSV exports and payslips.

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** "$1,234.50"; never shows "-$0.00". */
export function formatMoney(value: number): string {
  return money.format(Math.abs(value) < 0.005 ? 0 : value);
}

/** Fractions of a day as text: 0.25 → "¼ day", 1 → "1 day", 2.5 → "2½ days". */
export function formatDays(days: number): string {
  if (days === 0) return 'warning';
  const whole = Math.floor(days);
  const fraction = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[Math.round((days - whole) * 100) / 100] ?? '';
  const text = `${whole || ''}${fraction}` || '0';
  return `${text} day${days > 1 ? 's' : ''}`;
}

/** "09:05" → "9:05 AM" */
export function formatTime12(time24?: string): string {
  if (!time24) return '—';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Milliseconds as "h:mm". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(Math.abs(ms) / 60000);
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

/** Minutes as "2h 05m" / "45m". */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Quote a CSV cell when needed. */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const content = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  downloadBlob(filename, new Blob([content], { type: 'text/csv;charset=utf-8;' }));
}

export function downloadBlob(filename: string, blob: Blob) {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File-name-safe version of a name. */
export function slug(text: string): string {
  return (text || 'user').trim().replace(/[^\w\-]+/g, '_');
}
