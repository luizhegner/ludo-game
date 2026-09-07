/** Formatação de datas/durações em pt-BR, sem depender de Intl avançado. */

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const n = new Date(now);
  const sameYear = d.getFullYear() === n.getFullYear();
  const dm = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return sameYear ? dm : `${dm}/${d.getFullYear()}`;
}

/** "Hoje 19:44", "Ontem 20:10", "12/03 19:44", "12/03/2025 19:44". */
export function formatWhen(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const n = new Date(now);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(n) - startOfDay(d)) / 86400000);
  if (days === 0) return `Hoje ${formatTime(ts)}`;
  if (days === 1) return `Ontem ${formatTime(ts)}`;
  return `${formatDate(ts, now)} ${formatTime(ts)}`;
}

/** "45 s", "12 min", "1 h 05". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${pad(m % 60)}`;
}

/** "1 partida", "3 partidas". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function percent(x: number): string {
  return `${Math.round(x * 100)}%`;
}
