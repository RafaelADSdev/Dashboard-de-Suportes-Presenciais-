import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Ticket, TicketStatus } from '@/lib/mock-data';
import { formatarNomeExibicao } from '@/lib/format-name';
import { PrioritizedTicket } from '@/lib/priority-engine';
import {
  createInfoSlide,
  deleteInfoSlide,
  fetchInfoSlides,
  subscribeInfoSlides,
  type InfoSlide,
} from '@/lib/info-slides-db';
import { Button } from '@/components/ui/button';
import { User, Headset, ChevronLeft, ChevronRight, Settings, Plus, Trash2, Image, Type, CheckCircle2, Clock, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import hubOnLogo from '@/assets/hub_on_branco.png';
import backgroundVideo from '@/assets/hubon-background.mp4';
import stuppLogo from '@/assets/sup_stupp_branco.png';
import nascimentoLogo from '@/assets/diret_nascimento_branco.png';

// Paleta alinhada a tokens em index.css (--dash-*)
const C = {
  bg: 'var(--dash-bg)',
  surface: 'var(--dash-surface)',
  cardRaised: 'var(--dash-surface-raised)',
  border: 'var(--dash-border)',
  borderMuted: 'rgba(72, 72, 120, 0.5)',
  text: 'var(--dash-text)',
  textMuted: 'var(--dash-text-muted)',
  blue: 'var(--dash-accent-blue)',
  blueHex: '#38b6ff',
  blueDark: '#1a9bef',
  blueSubtle: 'rgba(56, 182, 255, 0.06)',
  blueFaint: 'rgba(56, 182, 255, 0.08)',
  blueSoft: 'rgba(56, 182, 255, 0.12)',
  blueGlow: 'rgba(56, 182, 255, 0.25)',
  rowStripe: 'rgba(56, 182, 255, 0.04)',
  rowFirst: 'rgba(56, 182, 255, 0.10)',
  green: 'var(--dash-accent-green)',
  greenBorder: 'rgba(193, 255, 114, 0.25)',
  headerAndamento: 'var(--dash-header-active)',
  headerFila: 'var(--dash-header-queue)',
  headerInfo: 'var(--dash-header-info)',
  statusAguardando: 'var(--dash-status-waiting)',
} as const;

/** Abas de superintendência. "S/N" = cards que o sistema não conseguiu identificar. */
const SUPERINTENDENCIA_TABS: { id: string; short: string; logo: string | null }[] = [
  { id: 'Stüpp', short: 'S', logo: stuppLogo },
  { id: 'Nascimento', short: 'N', logo: nascimentoLogo },
  { id: 'Não identificado', short: 'S/N', logo: null },
];

function nomeSolicitante(ticket: Ticket): string {
  const nome = ticket.solicitante?.trim();
  if (nome && nome !== '-' && nome !== 'Não informado') return formatarNomeExibicao(nome);
  const corretor = ticket.corretor?.trim();
  if (corretor && corretor !== '-') return formatarNomeExibicao(corretor);
  return 'Solicitante não informado';
}

function detalheFerramenta(ticket: Ticket): string {
  const partes = [ticket.ferramenta].filter(p => p && p !== '-');
  if (ticket.modulo && ticket.modulo !== '-') partes.push(ticket.modulo);
  return partes.join(' • ') || '-';
}

function textoDepartamento(ticket: Ticket): string | null {
  const dep = ticket.departamento?.trim();
  if (!dep || dep === '-') return null;
  return dep;
}

function textoDepartamentoOuTraco(ticket: Ticket): string {
  return textoDepartamento(ticket) ?? '-';
}

function SolicitanteAvatar({
  ticket,
  idx = 0,
  size,
  accent = C.blue,
}: {
  ticket: Pick<Ticket, 'solicitante' | 'solicitanteFoto'>;
  idx?: number;
  size: string;
  accent?: string;
}) {
  const initials = nomeSolicitante(ticket)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

  return (
    <Avatar
      className="shrink-0 rounded-full"
      style={{ width: size, height: size }}
    >
      {ticket.solicitanteFoto ? (
        <AvatarImage src={ticket.solicitanteFoto} alt={nomeSolicitante(ticket)} className="object-cover" />
      ) : null}
      <AvatarFallback
        className="rounded-full flex items-center justify-center text-white/90 font-bold"
        style={{
          background: `linear-gradient(135deg, hsl(${(idx * 55 + 200) % 360}, 50%, 35%), hsl(${(idx * 55 + 230) % 360}, 40%, 28%))`,
          fontSize: `calc(${size} * 0.32)`,
        }}
      >
        {initials || <User style={{ color: accent, width: `calc(${size} * 0.45)`, height: `calc(${size} * 0.45)` }} />}
      </AvatarFallback>
    </Avatar>
  );
}

interface PainelPrincipalProps {
  fila: PrioritizedTicket[];
  emAtendimento: Ticket[];
  allTickets: Ticket[];
  atendimentoAtual: string | null;
  superintendencia: string;
  onSuperintendenciaChange: (s: string) => void;
}

export function PainelPrincipal({
  fila, emAtendimento, allTickets,
  atendimentoAtual, superintendencia, onSuperintendenciaChange,
}: PainelPrincipalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [adminOpen, setAdminOpen] = useState(false);
  const [newSlideType, setNewSlideType] = useState<'text' | 'image'>('text');
  const [newSlideTitle, setNewSlideTitle] = useState('');
  const [newSlideContent, setNewSlideContent] = useState('');
  const [slides, setSlides] = useState<InfoSlide[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(true);
  const [slidesSaving, setSlidesSaving] = useState(false);
  const [slidesError, setSlidesError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [celebrationTicket, setCelebrationTicket] = useState<Ticket | null>(null);
  const prevAtendimentoRef = useRef<string | null>(null);
  const prevStatusRef = useRef<Map<string, TicketStatus>>(new Map());
  const celebrationTimeoutRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ultimoResolvido = useMemo(() => {
    return allTickets
      .filter(t => (t.status === 'concluido' || t.status === 'finalizado') && t.resolvidoEm)
      .sort((a, b) => new Date(b.resolvidoEm!).getTime() - new Date(a.resolvidoEm!).getTime())[0] ?? null;
  }, [allTickets]);

  const showResolvedCelebration = (ticket: Ticket) => {
    setCelebrationTicket(ticket);
    setShowResolved(true);
    if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
    celebrationTimeoutRef.current = window.setTimeout(() => setShowResolved(false), 6000);
  };

  useEffect(() => {
    if (prevAtendimentoRef.current && !atendimentoAtual) {
      const resolved = allTickets.find(
        t => t.id === prevAtendimentoRef.current && t.status === 'concluido'
      );
      if (resolved) showResolvedCelebration(resolved);
    }
    prevAtendimentoRef.current = atendimentoAtual;

    for (const ticket of allTickets) {
      const prev = prevStatusRef.current.get(ticket.id);
      if (prev === 'em_atendimento' && ticket.status === 'concluido') {
        showResolvedCelebration(ticket);
        break;
      }
    }
    prevStatusRef.current = new Map(allTickets.map(t => [t.id, t.status]));

    return () => {
      if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
    };
  }, [atendimentoAtual, allTickets]);

  const ticketAtual =
    (atendimentoAtual ? allTickets.find(t => t.id === atendimentoAtual) : null) ??
    emAtendimento[0] ??
    null;

  const loadSlides = useCallback(async () => {
    try {
      setSlidesError(null);
      const data = await fetchInfoSlides(superintendencia);
      setSlides(data);
      setCurrentSlide(prev => (data.length === 0 ? 0 : Math.min(prev, data.length - 1)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar informações';
      setSlidesError(message);
    } finally {
      setSlidesLoading(false);
    }
  }, [superintendencia]);

  useEffect(() => {
    setSlidesLoading(true);
    setCurrentSlide(0);
    loadSlides();
    const unsubscribe = subscribeInfoSlides(superintendencia, loadSlides);
    return unsubscribe;
  }, [superintendencia, loadSlides]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => setCurrentSlide(prev => (prev + 1) % slides.length), 4000);
    return () => clearInterval(interval);
  }, [slides.length]);

  const statusSummary = useMemo(() => [
    { name: 'Nova solicitação', value: allTickets.filter(t => t.status === 'nova_solicitacao').length, icon: 'new', color: C.headerFila },
    { name: 'Aguardando solicitante', value: allTickets.filter(t => t.status === 'aguardando_solicitante' || t.status === 'aguardando').length, icon: 'alert', color: C.statusAguardando },
    { name: 'Em atendimento', value: allTickets.filter(t => t.status === 'em_atendimento').length, icon: 'refresh', color: C.headerAndamento },
    { name: 'Concluídos', value: allTickets.filter(t => t.status === 'concluido' || t.status === 'finalizado').length, icon: 'check', color: C.headerAndamento },
  ], [allTickets]);

  const addSlide = async () => {
    if (!newSlideTitle.trim() || !newSlideContent.trim() || slidesSaving) return;
    setSlidesSaving(true);
    setSlidesError(null);
    try {
      await createInfoSlide(
        superintendencia,
        {
          type: newSlideType,
          title: newSlideTitle.trim(),
          content: newSlideContent.trim(),
        },
        slides.length
      );
      setNewSlideTitle('');
      setNewSlideContent('');
      await loadSlides();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar informação';
      setSlidesError(message);
    } finally {
      setSlidesSaving(false);
    }
  };

  const removeSlide = async (id: string) => {
    if (slidesSaving) return;
    setSlidesSaving(true);
    setSlidesError(null);
    try {
      await deleteInfoSlide(id);
      await loadSlides();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao remover informação';
      setSlidesError(message);
    } finally {
      setSlidesSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setNewSlideContent(reader.result as string);
    reader.readAsDataURL(file);
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const hasActiveTicket = !!ticketAtual;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Vídeo de fundo */}
      <div
        className="absolute inset-0 z-0 overflow-hidden pointer-events-none"
        aria-hidden
        style={{ background: C.bg }}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          src={backgroundVideo}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: 0.45 }}
        />
      </div>

      <div className="relative z-10 flex flex-col h-full min-h-0" style={{
        padding: 'clamp(12px, 1.5vh, 20px) clamp(14px, 1.5vw, 24px)',
      }}>
      {/* Resolved ticket overlay */}
      {showResolved && celebrationTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center celebration-overlay celebration-overlay-enter px-4"
          role="alertdialog"
          aria-live="assertive"
          aria-label="Suporte concluído"
        >
          <div className="celebration-glow" aria-hidden />
          <div className="celebration-card panel-card rounded-3xl text-center">
            <div className="celebration-badge">
              <CheckCircle2 size={28} strokeWidth={2.5} aria-hidden />
              Suporte concluído!
            </div>
            <div className="celebration-avatar-wrap mx-auto mb-6 flex justify-center">
              <SolicitanteAvatar
                ticket={celebrationTicket}
                size="clamp(120px, 16vw, 180px)"
                accent={C.green}
              />
            </div>
            <p className="celebration-name mb-4">{nomeSolicitante(celebrationTicket)}</p>
            <div className="panel-divider celebration-meta my-4" />
            <div className="celebration-meta space-y-2">
              <p
                className="font-semibold"
                style={{ color: C.textMuted, fontSize: 'clamp(1rem, 1.8vw, 1.35rem)' }}
              >
                {textoDepartamento(celebrationTicket) ?? '-'}
              </p>
              <p
                className="font-bold"
                style={{ color: C.blue, fontSize: 'clamp(1rem, 1.6vw, 1.25rem)' }}
              >
                {detalheFerramenta(celebrationTicket)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0 border-b pb-3"
        style={{
          marginBottom: 'clamp(10px, 1.5vh, 18px)',
          minHeight: 'clamp(60px, 10vh, 100px)',
          borderColor: C.borderMuted,
        }}
      >
        <div className="flex items-center gap-5 flex-1 justify-center">
          <img src={hubOnLogo} alt="Hub On" style={{ height: 'clamp(44px, 7.5vh, 85px)', filter: `drop-shadow(0 2px 12px ${C.blueGlow})` }} />
          <h1 className="font-black text-center text-white" style={{
            fontSize: 'clamp(1.8rem, 5vw, 4.5rem)',
            lineHeight: 1,
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))',
          }}>
            Fila de Suportes no Salão
          </h1>
        </div>
        <div className="tab-segment shrink-0">
          {SUPERINTENDENCIA_TABS.map(tab => {
            const isActive = superintendencia === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-active={isActive}
                aria-pressed={isActive}
                aria-label={`Superintendência ${tab.id}`}
                onClick={() => onSuperintendenciaChange(tab.id)}
                className="tab-segment-btn flex items-center justify-center"
              >
                {isActive && tab.logo ? (
                  <img src={tab.logo} alt={tab.id} style={{ height: 'clamp(28px, 4.5vh, 52px)' }} />
                ) : (
                  <span className="font-black" style={{
                    color: isActive ? C.text : C.textMuted,
                    fontSize: tab.logo
                      ? 'clamp(1rem, 1.8vw, 1.6rem)'
                      : isActive
                        ? 'clamp(1.3rem, 2.6vw, 2.2rem)'
                        : 'clamp(1rem, 1.8vw, 1.6rem)',
                  }}>
                    {tab.short}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main grid — more gap for breathing room */}
      <div className="flex-1 min-h-0 grid" style={{
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 'clamp(8px, 1vw, 16px)',
      }}>

        {/* ── Suporte em andamento ── */}
        <div className="rounded-2xl overflow-hidden flex flex-col panel-card">
          <div className="shrink-0 flex items-center justify-center panel-header" style={{
            background: C.headerAndamento,
          }}>
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-white" aria-hidden />
              <h2 className="panel-title">
                Suporte em andamento
              </h2>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col items-center justify-center panel-body">
            {ticketAtual ? (
              <div className="h-full w-full flex flex-col items-center justify-center text-center gap-4 animate-fade-in">
                <SolicitanteAvatar
                  ticket={ticketAtual}
                  size="clamp(72px, 7vw, 110px)"
                  accent={C.green}
                />
                <div className="space-y-2 max-w-full">
                  <p className="font-black leading-tight" style={{ color: C.text, fontSize: 'clamp(1rem, 1.6vw, 1.6rem)' }}>
                    {nomeSolicitante(ticketAtual)}
                  </p>
                  <div className="panel-divider" />
                  <p style={{ color: C.textMuted, fontSize: 'clamp(0.6rem, 0.85vw, 0.85rem)' }}>
                    {textoDepartamentoOuTraco(ticketAtual)}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: C.blue }} />
                    <span className="font-semibold" style={{ color: C.blue, fontSize: 'clamp(0.75rem, 1.05vw, 1.05rem)' }}>Em atendimento</span>
                  </div>
                  <p className="font-medium" style={{ color: C.textMuted, fontSize: 'clamp(0.75rem, 1.05vw, 1.05rem)' }}>
                    {ticketAtual.ferramenta} · {ticketAtual.id}
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="rounded-full p-5" style={{ background: C.blueFaint }}>
                  <Headset style={{ color: C.textMuted, width: 'clamp(28px, 3vw, 44px)', height: 'clamp(28px, 3vw, 44px)' }} />
                </div>
                <p className="font-medium" style={{ color: C.textMuted, fontSize: 'clamp(0.7rem, 0.9vw, 0.9rem)' }}>Nenhum atendimento</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Último suporte resolvido ── */}
        <div className="rounded-2xl overflow-hidden flex flex-col panel-card">
          <div className="shrink-0 flex items-center justify-center panel-header" style={{
            background: C.headerFila,
          }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-white" aria-hidden />
              <h2 className="panel-title">
                Último suporte resolvido
              </h2>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center panel-body">
            {ultimoResolvido ? (
              <div className="text-center space-y-2 animate-fade-in">
                <div className="mx-auto flex justify-center">
                  <SolicitanteAvatar
                    ticket={ultimoResolvido}
                    size="clamp(80px, 8vw, 120px)"
                    accent={C.green}
                  />
                </div>
                <p className="font-black leading-tight" style={{ color: C.text, fontSize: 'clamp(1rem, 1.5vw, 1.5rem)' }}>
                  {nomeSolicitante(ultimoResolvido)}
                </p>
                <div className="panel-divider" />
                <p className="font-medium" style={{ color: C.textMuted, fontSize: 'clamp(0.75rem, 1.05vw, 1.05rem)' }}>
                  {textoDepartamentoOuTraco(ultimoResolvido)}
                </p>
                <p className="font-semibold" style={{ color: C.blue, fontSize: 'clamp(0.75rem, 1.05vw, 1.05rem)' }}>
                  {detalheFerramenta(ultimoResolvido)}
                </p>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="mx-auto rounded-full p-5" style={{ background: C.blueFaint }}>
                  <CheckCircle2 style={{ color: C.textMuted, width: 'clamp(30px, 2.8vw, 46px)', height: 'clamp(30px, 2.8vw, 46px)' }} />
                </div>
                <p className="font-medium" style={{ color: C.textMuted, fontSize: 'clamp(0.7rem, 0.9vw, 0.9rem)' }}>Nenhum suporte resolvido</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Informações ── */}
        <div className="rounded-2xl overflow-hidden flex flex-col panel-card">
          <div className="shrink-0 flex items-center justify-center relative panel-header" style={{
            background: C.headerInfo,
          }}>
            <h2 className="panel-title">
              Informações
            </h2>
            <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-white/50 hover:text-white hover:bg-white/20 absolute right-3">
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto bg-white">
                <DialogHeader>
                  <DialogTitle className="text-gray-800">
                    Gerenciar informações — {superintendencia}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {slidesError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                      {slidesError}
                    </p>
                  )}
                  <div className="space-y-3 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Adicionar novo</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant={newSlideType === 'text' ? 'default' : 'outline'} className="h-7 text-xs gap-1" onClick={() => setNewSlideType('text')} disabled={slidesSaving}><Type className="h-3 w-3" /> Texto</Button>
                      <Button size="sm" variant={newSlideType === 'image' ? 'default' : 'outline'} className="h-7 text-xs gap-1" onClick={() => setNewSlideType('image')} disabled={slidesSaving}><Image className="h-3 w-3" /> Imagem</Button>
                    </div>
                    <Input placeholder="Título" value={newSlideTitle} onChange={e => setNewSlideTitle(e.target.value)} disabled={slidesSaving} className="h-8 text-xs text-gray-800 bg-white border-gray-300 placeholder:text-gray-400" />
                    {newSlideType === 'text' ? (
                      <Textarea placeholder="Conteúdo..." value={newSlideContent} onChange={e => setNewSlideContent(e.target.value)} disabled={slidesSaving} className="text-xs min-h-[60px] text-gray-800 bg-white border-gray-300 placeholder:text-gray-400" />
                    ) : (
                      <div className="space-y-2">
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} disabled={slidesSaving} className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700" />
                        {newSlideContent && <img src={newSlideContent} alt="Preview" className="w-full rounded-lg max-h-32 object-contain border border-gray-200" />}
                      </div>
                    )}
                    <Button size="sm" className="w-full h-7 text-xs gap-1" onClick={addSlide} disabled={slidesSaving}>
                      <Plus className="h-3 w-3" /> {slidesSaving ? 'Salvando…' : 'Adicionar'}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Slides ({slides.length})</p>
                    {slides.map((slide, i) => (
                      <div key={slide.id} className="flex items-center gap-2 bg-gray-100 rounded-lg p-2">
                        <span className="text-[10px] font-mono text-gray-400 w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{slide.title}</p>
                          <p className="text-[10px] text-gray-500 truncate">{slide.type === 'text' ? slide.content : '🖼️ Imagem'}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => removeSlide(slide.id)} disabled={slidesSaving}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex-1 relative overflow-hidden">
            {slidesLoading ? (
              <div className="flex items-center justify-center h-full" style={{ color: C.textMuted, fontSize: 'clamp(0.7rem, 0.9vw, 0.9rem)' }}>
                Carregando…
              </div>
            ) : slidesError && slides.length === 0 ? (
              <div className="flex items-center justify-center h-full px-4 text-center" style={{ color: C.textMuted, fontSize: 'clamp(0.65rem, 0.85vw, 0.85rem)' }}>
                {slidesError}
              </div>
            ) : slides.length > 0 ? (
              <>
                <div className="absolute inset-0 flex flex-col justify-center items-center" style={{ padding: 'clamp(16px, 1.5vw, 28px)' }}>
                  {slides[currentSlide]?.type === 'text' ? (
                    <div className="space-y-3 animate-fade-in text-center w-full">
                      <h3 className="font-bold" style={{ color: C.text, fontSize: 'clamp(0.95rem, 1.3vw, 1.3rem)' }}>{slides[currentSlide].title}</h3>
                      <p className="leading-relaxed whitespace-pre-line" style={{ color: C.textMuted, fontSize: 'clamp(0.75rem, 1vw, 1rem)' }}>{slides[currentSlide].content}</p>
                    </div>
                  ) : (
                    <div className="space-y-3 animate-fade-in text-center w-full">
                      <h3 className="font-bold" style={{ color: C.text, fontSize: 'clamp(0.95rem, 1.3vw, 1.3rem)' }}>{slides[currentSlide].title}</h3>
                      <img src={slides[currentSlide].content} alt={slides[currentSlide].title} className="w-full rounded-lg object-contain" style={{ maxHeight: '70%' }} />
                    </div>
                  )}
                </div>
                {slides.length > 1 && (
                  <>
                    <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2">
                      {slides.map((_, i) => (
                        <button key={i} onClick={() => setCurrentSlide(i)} className="rounded-full transition-all duration-300"
                          style={{ height: 6, width: i === currentSlide ? 20 : 6, backgroundColor: i === currentSlide ? C.headerFila : C.border }} />
                      ))}
                    </div>
                    <button onClick={() => setCurrentSlide(prev => (prev - 1 + slides.length) % slides.length)} className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center transition-colors" style={{ background: C.cardRaised, color: C.textMuted }}><ChevronLeft className="h-4 w-4" /></button>
                    <button onClick={() => setCurrentSlide(prev => (prev + 1) % slides.length)} className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center transition-colors" style={{ background: C.cardRaised, color: C.textMuted }}><ChevronRight className="h-4 w-4" /></button>
                  </>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: C.textMuted, fontSize: 'clamp(0.7rem, 0.9vw, 0.9rem)' }}>Clique em ⚙️ para adicionar</div>
            )}
          </div>
        </div>

        {/* ── Próximos suportes ── */}
        <div className="col-span-2 rounded-2xl overflow-hidden flex flex-col panel-card">
          <div className="shrink-0 flex items-center justify-center panel-header" style={{
            background: C.headerFila,
          }}>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-white" aria-hidden />
              <h2 className="panel-title">
                Próximos suportes
              </h2>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="grid shrink-0" style={{
              gridTemplateColumns: '0.35fr 1.2fr 1fr 0.75fr 0.85fr',
              padding: 'clamp(6px, 0.7vh, 10px) clamp(12px, 1.2vw, 20px)',
              borderBottom: `1px solid ${C.border}`,
              background: C.blueSubtle,
            }}>
              {['Pos.', 'Solicitante', 'Equipe/Departamento', 'Data/Hora', 'Ferramenta'].map(h => (
                <p key={h} className="uppercase tracking-wider font-bold" style={{ color: C.textMuted, fontSize: 'clamp(0.5rem, 0.7vw, 0.7rem)' }}>{h}</p>
              ))}
            </div>
            {/* Rows */}
            <div className="flex-1 flex flex-col overflow-y-auto">
              {fila.map((ticket, idx) => (
                <div
                  key={ticket.id}
                  className={`grid items-center queue-row ${idx === 0 ? 'queue-row-first' : ''}`}
                  style={{
                    gridTemplateColumns: '0.35fr 1.2fr 1fr 0.75fr 0.85fr',
                    padding: 'clamp(5px, 0.7vh, 10px) clamp(12px, 1.2vw, 20px)',
                    borderBottom: `1px solid ${C.borderMuted}`,
                    background: idx % 2 === 1 && idx !== 0 ? C.rowStripe : undefined,
                  }}
                >
                  <div className="flex items-center">
                    <span className="font-black rounded-lg flex items-center justify-center" style={{
                      color: idx === 0 ? '#0c0c1d' : C.text,
                      background: idx === 0 ? `linear-gradient(135deg, ${C.blueHex}, ${C.blueDark})` : C.blueSoft,
                      width: 'clamp(26px, 2.2vw, 36px)',
                      height: 'clamp(26px, 2.2vw, 36px)',
                      fontSize: 'clamp(0.6rem, 0.95vw, 0.95rem)',
                    }}>
                      {hasActiveTicket ? idx + 2 : idx + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 min-w-0">
                    <SolicitanteAvatar
                      ticket={ticket}
                      idx={idx}
                      size="clamp(30px, 2.5vw, 40px)"
                    />
                    <span className="font-semibold truncate" style={{ color: C.text, fontSize: 'clamp(0.7rem, 1.1vw, 1.1rem)' }}>
                      {nomeSolicitante(ticket)}
                    </span>
                  </div>
                  <span className="truncate font-medium" style={{ color: C.textMuted, fontSize: 'clamp(0.6rem, 0.9vw, 0.9rem)' }}>
                    {textoDepartamentoOuTraco(ticket)}
                  </span>
                  <span className="font-medium" style={{ color: C.textMuted, fontSize: 'clamp(0.6rem, 0.9vw, 0.9rem)' }}>{formatDateTime(ticket.criadoEm)}</span>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: C.blue }} />
                    <span className="truncate" style={{ color: C.textMuted, fontSize: 'clamp(0.6rem, 0.9vw, 0.9rem)' }}>{ticket.ferramenta}</span>
                  </div>
                </div>
              ))}
              {fila.length === 0 && (
                <div className="flex items-center justify-center flex-1" style={{ color: C.textMuted, fontSize: 'clamp(0.7rem, 0.9vw, 0.9rem)' }}>
                  🎉 Fila vazia!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Resumo por status ── */}
        <div className="rounded-2xl overflow-hidden flex flex-col panel-card">
          <div className="shrink-0 flex items-center justify-center panel-header" style={{
            background: C.headerInfo,
          }}>
            <h2 className="panel-title">
              Resumo por status
            </h2>
          </div>
          <div className="flex-1 flex items-center panel-body">
            <div className="flex flex-col gap-2 w-full">
              {statusSummary.map(s => (
                <div key={s.name} className="stat-row">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="stat-dot" style={{ backgroundColor: s.color }} aria-hidden />
                    <span className="font-medium truncate" style={{ color: C.textMuted, fontSize: 'clamp(0.55rem, 0.75vw, 0.8rem)' }}>
                      {s.name}
                    </span>
                  </div>
                  <span className="font-black tabular-nums shrink-0" style={{ color: s.color, fontSize: 'clamp(1.1rem, 1.6vw, 1.5rem)' }}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
