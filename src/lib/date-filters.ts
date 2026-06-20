/** Fuso do painel (alinhado ao horário de Brasília). */
export const DASHBOARD_TIMEZONE = 'America/Sao_Paulo';

export function localDateKey(date: Date, timeZone = DASHBOARD_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Início do dia no fuso local (00:00:00.000). */
export function startOfLocalDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Segunda-feira 00:00 da semana corrente (ISO, fuso local). */
export function startOfLocalWeek(date: Date = new Date()): Date {
  const d = startOfLocalDay(date);
  const weekday = d.getDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  d.setDate(d.getDate() - daysFromMonday);
  return d;
}

/**
 * Ticket criado no dia corrente (campo "Criado em" do Bitrix → criado_em).
 * Comparação por data no fuso do painel (America/Sao_Paulo).
 */
export function isCreatedToday(
  criadoEm: string,
  reference: Date = new Date(),
  timeZone = DASHBOARD_TIMEZONE
): boolean {
  const created = new Date(criadoEm);
  if (Number.isNaN(created.getTime())) return false;
  return localDateKey(created, timeZone) === localDateKey(reference, timeZone);
}

/** Ticket criado na semana corrente (segunda a domingo, fuso local). */
export function isCreatedThisWeek(criadoEm: string, reference: Date = new Date()): boolean {
  const created = new Date(criadoEm);
  if (Number.isNaN(created.getTime())) return false;
  return created >= startOfLocalWeek(reference);
}

export function filterTicketsCreatedToday<T extends { criadoEm: string }>(
  tickets: T[],
  reference: Date = new Date(),
  timeZone = DASHBOARD_TIMEZONE
): T[] {
  return tickets.filter(t => isCreatedToday(t.criadoEm, reference, timeZone));
}

/** Milissegundos até a próxima meia-noite no fuso do painel. */
export function msUntilNextMidnight(timeZone = DASHBOARD_TIMEZONE): number {
  const now = new Date();
  const todayKey = localDateKey(now, timeZone);
  let probe = now.getTime() + 60_000;
  const limit = now.getTime() + 48 * 3_600_000;

  while (probe < limit) {
    if (localDateKey(new Date(probe), timeZone) !== todayKey) {
      let lo = now.getTime();
      let hi = probe;
      while (hi - lo > 1_000) {
        const mid = Math.floor((lo + hi) / 2);
        if (localDateKey(new Date(mid), timeZone) === todayKey) lo = mid;
        else hi = mid;
      }
      return hi - now.getTime() + 1_000;
    }
    probe += 60_000;
  }

  return 3_600_000;
}

/** Agenda callback na próxima meia-noite (fuso do painel). Retorna função de cancelamento. */
export function scheduleMidnightReset(onMidnight: () => void, timeZone = DASHBOARD_TIMEZONE): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const arm = () => {
    timeoutId = setTimeout(() => {
      onMidnight();
      arm();
    }, msUntilNextMidnight(timeZone));
  };

  arm();

  return () => {
    if (timeoutId !== null) clearTimeout(timeoutId);
  };
}
