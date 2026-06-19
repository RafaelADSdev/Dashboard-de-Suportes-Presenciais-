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

/** Ticket criado no dia corrente (comparação por data local). */
export function isCreatedToday(criadoEm: string, reference: Date = new Date()): boolean {
  const created = new Date(criadoEm);
  if (Number.isNaN(created.getTime())) return false;
  return startOfLocalDay(created).getTime() === startOfLocalDay(reference).getTime();
}

/** Ticket criado na semana corrente (segunda a domingo, fuso local). */
export function isCreatedThisWeek(criadoEm: string, reference: Date = new Date()): boolean {
  const created = new Date(criadoEm);
  if (Number.isNaN(created.getTime())) return false;
  return created >= startOfLocalWeek(reference);
}
