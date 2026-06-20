import { useState, useMemo, useCallback, useEffect } from 'react';
import { priorizarFila, getEmAtendimento } from '@/lib/priority-engine';
import { PainelPrincipal } from '@/components/PainelPrincipal';
import { fetchTickets, subscribeTickets } from '@/lib/tickets-db';
import type { Ticket } from '@/lib/mock-data';
import { filterTicketsCreatedToday, scheduleMidnightReset } from '@/lib/date-filters';
import { Loader2 } from 'lucide-react';

export default function Index() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [atendimentoAtual, setAtendimentoAtual] = useState<string | null>(null);
  const [superintendencia, setSuperintendencia] = useState<string>('Stüpp');
  const [diaPainel, setDiaPainel] = useState(() => Date.now());

  const loadTickets = useCallback(async () => {
    try {
      const data = await fetchTickets();
      setTickets(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar tickets';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
    return subscribeTickets(() => {
      loadTickets();
    });
  }, [loadTickets]);

  useEffect(() => {
    return scheduleMidnightReset(() => {
      setDiaPainel(Date.now());
      loadTickets();
    });
  }, [loadTickets]);

  const ticketsHoje = useMemo(
    () => filterTicketsCreatedToday(tickets),
    [tickets, diaPainel]
  );

  const filteredTickets = useMemo(
    () => ticketsHoje.filter(t => t.superintendencia === superintendencia),
    [ticketsHoje, superintendencia]
  );

  useEffect(() => {
    const emAtend = filteredTickets.filter(t => t.status === 'em_atendimento');
    setAtendimentoAtual(prev =>
      prev && filteredTickets.some(t => t.id === prev && t.status === 'em_atendimento')
        ? prev
        : emAtend[0]?.id ?? null
    );
  }, [filteredTickets]);

  const fila = useMemo(() => priorizarFila(filteredTickets), [filteredTickets]);
  const emAtendimento = useMemo(() => getEmAtendimento(filteredTickets), [filteredTickets]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c0c1d] text-[#e8e8f0]">
        <Loader2 className="h-10 w-10 animate-spin text-[#38b6ff]" />
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="fixed left-4 right-4 top-4 z-50 rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      <PainelPrincipal
        fila={fila}
        emAtendimento={emAtendimento}
        allTickets={filteredTickets}
        atendimentoAtual={atendimentoAtual}
        superintendencia={superintendencia}
        onSuperintendenciaChange={setSuperintendencia}
      />
    </>
  );
}
