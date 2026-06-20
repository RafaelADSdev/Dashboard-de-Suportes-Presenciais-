import { describe, it, expect } from 'vitest';
import { isSuportePresencialNoSalao, filterSuportePresencialNoSalao } from '@/lib/bitrix-filters';

describe('bitrix-filters', () => {
  it('aceita estágio SUPORTE PRESENCIAL NO SALÃO', () => {
    expect(isSuportePresencialNoSalao({ estagioBitrix: 'SUPORTE PRESENCIAL NO SALÃO' })).toBe(true);
  });

  it('rejeita outro tipo de suporte', () => {
    expect(isSuportePresencialNoSalao({ estagioBitrix: 'Suporte remoto' })).toBe(false);
  });

  it('rejeita ticket sem estágio', () => {
    expect(isSuportePresencialNoSalao({})).toBe(false);
  });

  it('filtra lista mantendo só suporte presencial no salão', () => {
    const tickets = [
      { id: '1', estagioBitrix: 'SUPORTE PRESENCIAL NO SALÃO' },
      { id: '2', estagioBitrix: 'Triagem' },
    ];
    expect(filterSuportePresencialNoSalao(tickets).map(t => t.id)).toEqual(['1']);
  });
});
