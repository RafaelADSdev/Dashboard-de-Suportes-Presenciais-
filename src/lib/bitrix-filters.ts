export const SUPORTE_PRESENCIAL_NO_SALAO = 'SUPORTE PRESENCIAL NO SALÃO';

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

const REQUIRED_STAGE_KEY = normalizeLabel(SUPORTE_PRESENCIAL_NO_SALAO);

/** Ticket com tipo "SUPORTE PRESENCIAL NO SALÃO" (campo Suporte - Resolução do chamado). */
export function isSuportePresencialNoSalao(
  ticket: Pick<{ estagioBitrix?: string | null; titulo?: string }>
): boolean {
  const candidates = [ticket.estagioBitrix, ticket.titulo].filter(Boolean) as string[];
  return candidates.some(text => normalizeLabel(text).includes(REQUIRED_STAGE_KEY));
}

export function filterSuportePresencialNoSalao<T extends { estagioBitrix?: string | null; titulo?: string }>(
  tickets: T[]
): T[] {
  return tickets.filter(isSuportePresencialNoSalao);
}
