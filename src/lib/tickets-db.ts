import { isSupabaseConfigured, supabase } from '@/integrations/supabase/client';
import type { TicketRow } from '@/integrations/supabase/types';
import type { NivelImpacto, Ticket, TicketStatus, TicketTipo } from '@/lib/mock-data';

const VALID_STATUS: TicketStatus[] = [
  'aguardando',
  'validar_ajuste',
  'em_atendimento',
  'concluido',
  'finalizado',
  'nova_solicitacao',
  'aguardando_solicitante',
];

const VALID_TIPO: TicketTipo[] = [
  'duvida',
  'erro_tecnico',
  'processo',
  'treinamento',
  'suporte_presencial',
];

const VALID_IMPACTO: NivelImpacto[] = ['baixo', 'medio', 'alto'];

function asStatus(value: string): TicketStatus {
  return VALID_STATUS.includes(value as TicketStatus) ? (value as TicketStatus) : 'nova_solicitacao';
}

function asTipo(value: string): TicketTipo {
  return VALID_TIPO.includes(value as TicketTipo) ? (value as TicketTipo) : 'suporte_presencial';
}

function asImpacto(value: string): NivelImpacto {
  return VALID_IMPACTO.includes(value as NivelImpacto) ? (value as NivelImpacto) : 'medio';
}

export function rowToTicket(row: TicketRow): Ticket {
  return {
    id: row.ticket_id,
    titulo: row.titulo,
    solicitante: row.solicitante,
    solicitanteFoto: row.solicitante_foto ?? undefined,
    responsavel: row.responsavel ?? '-',
    corretor: row.corretor,
    departamento: row.departamento,
    diretoria: row.diretoria,
    lider: row.lider,
    ferramenta: row.ferramenta,
    modulo: row.modulo,
    tipo: asTipo(row.tipo),
    nivelImpacto: asImpacto(row.nivel_impacto),
    status: asStatus(row.status),
    interacoes: row.interacoes,
    reincidente: row.reincidente,
    temaReincidencia: row.tema_reincidencia ?? undefined,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    resolvidoEm: row.resolvido_em ?? undefined,
    negociosAtivos: row.negocios_ativos,
    superintendencia: row.superintendencia,
    estagioBitrix: row.estagio_bitrix ?? undefined,
  };
}

export async function fetchTickets(): Promise<Ticket[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      'Supabase não configurado. Copie .env.example para .env e preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.'
    );
  }

  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .order('atualizado_em', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToTicket);
}

export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  resolvidoEm?: string | null
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase não configurado.');
  }

  const payload: { status: TicketStatus; resolvido_em?: string | null } = { status };
  if (resolvidoEm !== undefined) {
    payload.resolvido_em = resolvidoEm;
  }

  const { error } = await supabase
    .from('tickets')
    .update(payload)
    .eq('ticket_id', ticketId);

  if (error) throw error;
}

export function subscribeTickets(onChange: () => void) {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  const channel = supabase
    .channel('tickets-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tickets' },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
