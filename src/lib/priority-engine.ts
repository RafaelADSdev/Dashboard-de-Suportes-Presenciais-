import { Ticket } from './mock-data';

export interface PrioritizedTicket extends Ticket {
  pontuacao: number;
  posicaoFila: number;
  minutosAguardando: number;
  tempoEstimadoEspera: number;
}

/** Status que entram na fila de espera (inclui valores vindos do Bitrix). */
export const FILA_STATUS = [
  'nova_solicitacao',
  'aguardando',
  'validar_ajuste',
] as const;

function minutosNaEsteira(ticket: Ticket): number {
  return Math.round((Date.now() - new Date(ticket.criadoEm).getTime()) / 60000);
}

export function priorizarFila(
  tickets: Ticket[],
  tempoMedioAtendimento: number = 25
): PrioritizedTicket[] {
  const filaAtiva = tickets
    .filter(t => (FILA_STATUS as readonly string[]).includes(t.status))
    .map(t => {
      const minutosAguardando = minutosNaEsteira(t);
      return {
        ...t,
        pontuacao: minutosAguardando,
        posicaoFila: 0,
        minutosAguardando,
        tempoEstimadoEspera: 0,
      };
    })
    .sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime());

  filaAtiva.forEach((t, i) => {
    t.posicaoFila = i + 1;
    t.tempoEstimadoEspera = i * tempoMedioAtendimento;
  });

  return filaAtiva;
}

export function getEmAtendimento(tickets: Ticket[]): Ticket[] {
  return tickets.filter(t => t.status === 'em_atendimento');
}
