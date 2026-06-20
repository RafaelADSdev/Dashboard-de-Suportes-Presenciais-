export type TicketStatus =
  | 'aguardando'
  | 'validar_ajuste'
  | 'em_atendimento'
  | 'concluido'
  | 'finalizado'
  | 'nova_solicitacao'
  | 'aguardando_solicitante';
export type TicketTipo = 'duvida' | 'erro_tecnico' | 'processo' | 'treinamento' | 'suporte_presencial';
export type NivelImpacto = 'baixo' | 'medio' | 'alto';

export interface Ticket {
  id: string;
  titulo: string;
  solicitante: string;
  solicitanteFoto?: string;
  responsavel: string;
  corretor: string;
  departamento: string;
  diretoria: string;
  lider: string;
  ferramenta: string;
  modulo: string;
  tipo: TicketTipo;
  nivelImpacto: NivelImpacto;
  status: TicketStatus;
  interacoes: number;
  reincidente: boolean;
  temaReincidencia?: string;
  criadoEm: string;
  atualizadoEm: string;
  resolvidoEm?: string;
  negociosAtivos: number;
  superintendencia: string;
  estagioBitrix?: string;
}
