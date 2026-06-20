import { describe, it, expect } from 'vitest';
import {
  DASHBOARD_TIMEZONE,
  isCreatedToday,
  filterTicketsCreatedToday,
  localDateKey,
} from '@/lib/date-filters';

describe('date-filters', () => {
  it('usa America/Sao_Paulo como fuso do painel', () => {
    expect(DASHBOARD_TIMEZONE).toBe('America/Sao_Paulo');
  });

  it('identifica ticket criado no mesmo dia (BRT)', () => {
    const ref = new Date('2026-06-20T15:00:00-03:00');
    expect(isCreatedToday('2026-06-20T08:30:00-03:00', ref)).toBe(true);
    expect(isCreatedToday('2026-06-19T23:59:00-03:00', ref)).toBe(false);
  });

  it('filtra lista mantendo só tickets do dia', () => {
    const ref = new Date('2026-06-20T12:00:00-03:00');
    const tickets = [
      { id: '1', criadoEm: '2026-06-20T09:00:00-03:00' },
      { id: '2', criadoEm: '2026-06-19T18:00:00-03:00' },
    ];
    const hoje = filterTicketsCreatedToday(tickets, ref);
    expect(hoje.map(t => t.id)).toEqual(['1']);
  });

  it('localDateKey formata YYYY-MM-DD', () => {
    const key = localDateKey(new Date('2026-06-20T23:30:00-03:00'));
    expect(key).toBe('2026-06-20');
  });
});
