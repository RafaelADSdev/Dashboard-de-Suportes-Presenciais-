import { useState, useEffect, useMemo, useRef } from 'react';
import type { Ticket, TicketStatus } from '@/lib/mock-data';
import { PrioritizedTicket } from '@/lib/priority-engine';
import { Button } from '@/components/ui/button';
import { User, Headset, ChevronLeft, ChevronRight, Settings, Plus, Trash2, Image, Type, AlertTriangle, RefreshCw, CheckCircle2, FileText, Clock, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import hubOnLogo from '@/assets/hub_on_branco.png';
import backgroundVideo from '@/assets/hubon-background.mp4';
import stuppLogo from '@/assets/sup_stupp_branco.png';
import nascimentoLogo from '@/assets/diret_nascimento_branco.png';

// Dark mode palette
const DARK_BG = '#0c0c1d';
const DARK_CARD = '#161630';
const DARK_CARD_LIGHTER = '#1e1e42';
const DARK_BORDER = '#2a2a50';
const DARK_TEXT = '#e8e8f0';
const DARK_TEXT_MUTED = '#8888a8';
const COLOR_BLUE = '#38b6ff';
const COLOR_GREEN = '#c1ff72';
const HEADER_ANDAMENTO = '#1FA841';
const HEADER_RESOLVIDO_FILA = '#165962';
const HEADER_INFO_STATUS = '#002248';
/** Teal mais claro — legível sobre fundo escuro (#002248 some no card) */
const STATUS_AGUARDANDO = '#5EC4D4';

type InfoSlide = {
  id: string;
  type: 'text' | 'image';
  title: string;
  content: string;
};

const initialSlides: InfoSlide[] = [
  {
    id: 'local-1',
    type: 'text',
    title: 'Bem-vindo',
    content: 'Use o painel para acompanhar a fila de suporte presencial em tempo real.',
  },
];

function nomeSolicitante(ticket: Ticket): string {
  const nome = ticket.solicitante?.trim();
  if (nome && nome !== '-' && nome !== 'Não informado') return nome;
  const corretor = ticket.corretor?.trim();
  if (corretor && corretor !== '-') return corretor;
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
  accent = COLOR_BLUE,
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
  const [slides, setSlides] = useState<InfoSlide[]>(initialSlides);
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
    celebrationTimeoutRef.current = window.setTimeout(() => setShowResolved(false), 4000);
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

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => setCurrentSlide(prev => (prev + 1) % slides.length), 4000);
    return () => clearInterval(interval);
  }, [slides.length]);

  const statusSummary = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return [
      { name: 'Nova solicitação', value: allTickets.filter(t => t.status === 'nova_solicitacao').length, icon: 'new', color: HEADER_RESOLVIDO_FILA },
      { name: 'Aguardando solicitante', value: allTickets.filter(t => t.status === 'aguardando_solicitante' || t.status === 'aguardando').length, icon: 'alert', color: STATUS_AGUARDANDO },
      { name: 'Em atendimento', value: allTickets.filter(t => t.status === 'em_atendimento').length, icon: 'refresh', color: HEADER_ANDAMENTO },
      { name: 'Concluídos', value: allTickets.filter(t => { if (!t.resolvidoEm) return false; return new Date(t.resolvidoEm) >= today; }).length, icon: 'check', color: HEADER_ANDAMENTO },
    ];
  }, [allTickets]);

  const addSlide = () => {
    if (!newSlideTitle.trim() || !newSlideContent.trim()) return;
    setSlides(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: newSlideType,
        title: newSlideTitle.trim(),
        content: newSlideContent.trim(),
      },
    ]);
    setNewSlideTitle(''); setNewSlideContent('');
  };

  const removeSlide = (id: string) => {
    setSlides(prev => prev.filter(slide => slide.id !== id));
    if (currentSlide >= slides.length - 1) setCurrentSlide(0);
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

  const getStatusIcon = (icon: string, size: number = 22) => {
    switch (icon) {
      case 'new': return <FileText size={size} />;
      case 'alert': return <AlertTriangle size={size} />;
      case 'refresh': return <RefreshCw size={size} />;
      case 'check': return <CheckCircle2 size={size} />;
      default: return null;
    }
  };

  const hasActiveTicket = !!ticketAtual;

  const cardStyle = {
    background: DARK_CARD,
    border: `1px solid ${DARK_BORDER}`,
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Vídeo de fundo */}
      <div
        className="absolute inset-0 z-0 overflow-hidden pointer-events-none"
        aria-hidden
        style={{ background: DARK_BG }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ backgroundColor: 'rgba(8,8,20,0.9)', backdropFilter: 'blur(16px)' }}>
          <div className="rounded-3xl p-10 shadow-2xl text-center animate-fade-in" style={{
            background: DARK_CARD,
            border: `1px solid ${COLOR_GREEN}40`,
            maxWidth: '440px',
          }}>
            <div className="mx-auto mb-5 flex justify-center">
              <SolicitanteAvatar
                ticket={celebrationTicket}
                size="clamp(96px, 10vw, 120px)"
                accent={COLOR_GREEN}
              />
            </div>
            <h2 className="text-3xl font-black mb-2" style={{ color: COLOR_GREEN }}>Suporte concluído!</h2>
            <p className="text-xl font-semibold" style={{ color: DARK_TEXT }}>{nomeSolicitante(celebrationTicket)}</p>
            {textoDepartamento(celebrationTicket) && (
              <p className="text-base mt-1" style={{ color: DARK_TEXT_MUTED }}>{textoDepartamento(celebrationTicket)}</p>
            )}
            <p className="text-base mt-1" style={{ color: COLOR_BLUE }}>{detalheFerramenta(celebrationTicket)}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between shrink-0" style={{ marginBottom: 'clamp(10px, 1.5vh, 18px)', minHeight: 'clamp(60px, 10vh, 100px)' }}>
        <div className="flex items-center gap-5 flex-1 justify-center">
          <img src={hubOnLogo} alt="Hub On" style={{ height: 'clamp(44px, 7.5vh, 85px)', filter: `drop-shadow(0 2px 12px ${COLOR_BLUE}40)` }} />
          <h1 className="font-black text-center text-white" style={{
            fontSize: 'clamp(1.8rem, 5vw, 4.5rem)',
            lineHeight: 1,
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))',
          }}>
            Fila de Suportes no Salão
          </h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {['Stüpp', 'Nascimento'].map(s => {
            const isActive = superintendencia === s;
            return (
              <button key={s} onClick={() => onSuperintendenciaChange(s)}
                className="rounded-2xl font-bold transition-all duration-300 flex items-center justify-center"
                style={{
                  background: isActive ? `${DARK_CARD_LIGHTER}` : 'transparent',
                  border: isActive ? `1px solid ${DARK_BORDER}` : '1px solid transparent',
                  padding: isActive ? '0.6vh 1.2vw' : '0.6vh 0.8vw',
                  opacity: isActive ? 1 : 0.35,
                }}>
                {isActive ? (
                  <img src={s === 'Stüpp' ? stuppLogo : nascimentoLogo} alt={s}
                    style={{ height: 'clamp(32px, 5.5vh, 65px)' }} />
                ) : (
                  <span className="font-black" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(1.1rem, 2.2vw, 2rem)' }}>
                    {s === 'Stüpp' ? 'S' : 'N'}
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
        <div className="rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
          <div className="shrink-0 flex items-center justify-center" style={{
            background: HEADER_ANDAMENTO,
            padding: 'clamp(6px, 0.8vh, 12px) 16px',
          }}>
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-white" />
              <h2 className="font-bold tracking-wide text-white" style={{ fontSize: 'clamp(0.75rem, 1.3vw, 1.15rem)' }}>
                Suporte em andamento
              </h2>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col items-center justify-center" style={{ padding: 'clamp(16px, 1.5vw, 28px)' }}>
            {ticketAtual ? (
              <div className="h-full w-full flex flex-col items-center justify-center text-center gap-4 animate-fade-in">
                <SolicitanteAvatar
                  ticket={ticketAtual}
                  size="clamp(72px, 7vw, 110px)"
                  accent={COLOR_GREEN}
                />
                <div className="space-y-2 max-w-full">
                  <p style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.6rem, 0.85vw, 0.85rem)' }}>
                    {textoDepartamentoOuTraco(ticketAtual)}
                  </p>
                  <p className="font-black leading-tight" style={{ color: DARK_TEXT, fontSize: 'clamp(1rem, 1.6vw, 1.6rem)' }}>
                    {nomeSolicitante(ticketAtual)}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: COLOR_BLUE }} />
                    <span className="font-semibold" style={{ color: COLOR_BLUE, fontSize: 'clamp(0.75rem, 1.05vw, 1.05rem)' }}>Em atendimento</span>
                  </div>
                  <p className="font-medium" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.75rem, 1.05vw, 1.05rem)' }}>
                    {ticketAtual.ferramenta} · {ticketAtual.id}
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="rounded-full p-5" style={{ background: `${COLOR_BLUE}08` }}>
                  <Headset style={{ color: DARK_TEXT_MUTED, width: 'clamp(28px, 3vw, 44px)', height: 'clamp(28px, 3vw, 44px)' }} />
                </div>
                <p className="font-medium" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.7rem, 0.9vw, 0.9rem)' }}>Nenhum atendimento</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Último suporte resolvido ── */}
        <div className="rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
          <div className="shrink-0 flex items-center justify-center" style={{
            background: HEADER_RESOLVIDO_FILA,
            padding: 'clamp(6px, 0.8vh, 12px) 16px',
          }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-white" />
              <h2 className="font-bold text-white tracking-wide" style={{ fontSize: 'clamp(0.75rem, 1.3vw, 1.15rem)' }}>
                Último suporte resolvido
              </h2>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center" style={{ padding: 'clamp(16px, 1.5vw, 28px)' }}>
            {ultimoResolvido ? (
              <div className="text-center space-y-2 animate-fade-in">
                <div className="mx-auto flex justify-center">
                  <SolicitanteAvatar
                    ticket={ultimoResolvido}
                    size="clamp(80px, 8vw, 120px)"
                    accent={COLOR_GREEN}
                  />
                </div>
                <p className="font-black leading-tight" style={{ color: DARK_TEXT, fontSize: 'clamp(1rem, 1.5vw, 1.5rem)' }}>
                  {nomeSolicitante(ultimoResolvido)}
                </p>
                {textoDepartamento(ultimoResolvido) && (
                  <p className="font-medium" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.75rem, 1.05vw, 1.05rem)' }}>
                    {textoDepartamento(ultimoResolvido)}
                  </p>
                )}
                <p className="font-semibold" style={{ color: COLOR_BLUE, fontSize: 'clamp(0.75rem, 1.05vw, 1.05rem)' }}>
                  {detalheFerramenta(ultimoResolvido)}
                </p>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="mx-auto rounded-full p-5" style={{ background: `${COLOR_BLUE}08` }}>
                  <CheckCircle2 style={{ color: DARK_TEXT_MUTED, width: 'clamp(30px, 2.8vw, 46px)', height: 'clamp(30px, 2.8vw, 46px)' }} />
                </div>
                <p className="font-medium" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.7rem, 0.9vw, 0.9rem)' }}>Nenhum suporte resolvido</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Informações ── */}
        <div className="rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
          <div className="shrink-0 flex items-center justify-center relative" style={{
            background: HEADER_INFO_STATUS,
            padding: 'clamp(6px, 0.8vh, 12px) 16px',
          }}>
            <h2 className="font-bold text-white tracking-wide" style={{ fontSize: 'clamp(0.75rem, 1.3vw, 1.15rem)' }}>
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
                  <DialogTitle className="text-gray-800">Gerenciar informações</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-3 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Adicionar novo</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant={newSlideType === 'text' ? 'default' : 'outline'} className="h-7 text-xs gap-1" onClick={() => setNewSlideType('text')}><Type className="h-3 w-3" /> Texto</Button>
                      <Button size="sm" variant={newSlideType === 'image' ? 'default' : 'outline'} className="h-7 text-xs gap-1" onClick={() => setNewSlideType('image')}><Image className="h-3 w-3" /> Imagem</Button>
                    </div>
                    <Input placeholder="Título" value={newSlideTitle} onChange={e => setNewSlideTitle(e.target.value)} className="h-8 text-xs text-gray-800 bg-white border-gray-300 placeholder:text-gray-400" />
                    {newSlideType === 'text' ? (
                      <Textarea placeholder="Conteúdo..." value={newSlideContent} onChange={e => setNewSlideContent(e.target.value)} className="text-xs min-h-[60px] text-gray-800 bg-white border-gray-300 placeholder:text-gray-400" />
                    ) : (
                      <div className="space-y-2">
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700" />
                        {newSlideContent && <img src={newSlideContent} alt="Preview" className="w-full rounded-lg max-h-32 object-contain border border-gray-200" />}
                      </div>
                    )}
                    <Button size="sm" className="w-full h-7 text-xs gap-1" onClick={addSlide}><Plus className="h-3 w-3" /> Adicionar</Button>
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
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => removeSlide(slide.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex-1 relative overflow-hidden">
            {slides.length > 0 ? (
              <>
                <div className="absolute inset-0 flex flex-col justify-center items-center" style={{ padding: 'clamp(16px, 1.5vw, 28px)' }}>
                  {slides[currentSlide]?.type === 'text' ? (
                    <div className="space-y-3 animate-fade-in text-center w-full">
                      <h3 className="font-bold" style={{ color: DARK_TEXT, fontSize: 'clamp(0.95rem, 1.3vw, 1.3rem)' }}>{slides[currentSlide].title}</h3>
                      <p className="leading-relaxed whitespace-pre-line" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.75rem, 1vw, 1rem)' }}>{slides[currentSlide].content}</p>
                    </div>
                  ) : (
                    <div className="space-y-3 animate-fade-in text-center w-full">
                      <h3 className="font-bold" style={{ color: DARK_TEXT, fontSize: 'clamp(0.95rem, 1.3vw, 1.3rem)' }}>{slides[currentSlide].title}</h3>
                      <img src={slides[currentSlide].content} alt={slides[currentSlide].title} className="w-full rounded-lg object-contain" style={{ maxHeight: '70%' }} />
                    </div>
                  )}
                </div>
                {slides.length > 1 && (
                  <>
                    <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2">
                      {slides.map((_, i) => (
                        <button key={i} onClick={() => setCurrentSlide(i)} className="rounded-full transition-all duration-300"
                          style={{ height: 6, width: i === currentSlide ? 20 : 6, backgroundColor: i === currentSlide ? HEADER_RESOLVIDO_FILA : DARK_BORDER }} />
                      ))}
                    </div>
                    <button onClick={() => setCurrentSlide(prev => (prev - 1 + slides.length) % slides.length)} className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center transition-colors" style={{ background: DARK_CARD_LIGHTER, color: DARK_TEXT_MUTED }}><ChevronLeft className="h-4 w-4" /></button>
                    <button onClick={() => setCurrentSlide(prev => (prev + 1) % slides.length)} className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center transition-colors" style={{ background: DARK_CARD_LIGHTER, color: DARK_TEXT_MUTED }}><ChevronRight className="h-4 w-4" /></button>
                  </>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.7rem, 0.9vw, 0.9rem)' }}>Clique em ⚙️ para adicionar</div>
            )}
          </div>
        </div>

        {/* ── Próximos suportes ── */}
        <div className="col-span-2 rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
          <div className="shrink-0 flex items-center justify-center" style={{
            background: HEADER_RESOLVIDO_FILA,
            padding: 'clamp(6px, 0.8vh, 12px) 16px',
          }}>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-white" />
              <h2 className="font-bold text-white tracking-wide" style={{ fontSize: 'clamp(0.75rem, 1.3vw, 1.15rem)' }}>
                Próximos suportes
              </h2>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="grid shrink-0" style={{
              gridTemplateColumns: '0.35fr 1.2fr 1fr 0.75fr 0.85fr',
              padding: 'clamp(6px, 0.7vh, 10px) clamp(12px, 1.2vw, 20px)',
              borderBottom: `1px solid ${DARK_BORDER}`,
              background: `${COLOR_BLUE}06`,
            }}>
              {['Pos.', 'Solicitante', 'Departamento', 'Data/Hora', 'Ferramenta'].map(h => (
                <p key={h} className="uppercase tracking-wider font-bold" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.5rem, 0.7vw, 0.7rem)' }}>{h}</p>
              ))}
            </div>
            {/* Rows */}
            <div className="flex-1 flex flex-col">
              {fila.slice(0, 5).map((ticket, idx) => (
                <div key={ticket.id} className="grid items-center transition-colors" style={{
                  gridTemplateColumns: '0.35fr 1.2fr 1fr 0.75fr 0.85fr',
                  padding: 'clamp(5px, 0.7vh, 10px) clamp(12px, 1.2vw, 20px)',
                  borderBottom: `1px solid ${DARK_BORDER}40`,
                  background: idx % 2 === 0 ? 'transparent' : `${COLOR_BLUE}04`,
                }}>
                  <div className="flex items-center">
                    <span className="font-black rounded-lg flex items-center justify-center" style={{
                      color: idx === 0 ? DARK_BG : DARK_TEXT,
                      background: idx === 0 ? `linear-gradient(135deg, ${COLOR_BLUE}, #1a9bef)` : `${COLOR_BLUE}12`,
                      width: 'clamp(26px, 2.2vw, 36px)',
                      height: 'clamp(26px, 2.2vw, 36px)',
                      fontSize: 'clamp(0.6rem, 0.95vw, 0.95rem)',
                    }}>
                      {hasActiveTicket ? idx + 2 : idx + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <SolicitanteAvatar
                      ticket={ticket}
                      idx={idx}
                      size="clamp(30px, 2.5vw, 40px)"
                    />
                    <span className="font-semibold truncate" style={{ color: DARK_TEXT, fontSize: 'clamp(0.7rem, 1.1vw, 1.1rem)' }}>{ticket.solicitante}</span>
                  </div>
                  <span className="truncate font-medium" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.6rem, 0.9vw, 0.9rem)' }}>
                    {textoDepartamentoOuTraco(ticket)}
                  </span>
                  <span className="font-medium" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.6rem, 0.9vw, 0.9rem)' }}>{formatDateTime(ticket.criadoEm)}</span>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLOR_BLUE }} />
                    <span className="truncate" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.6rem, 0.9vw, 0.9rem)' }}>{ticket.ferramenta}</span>
                  </div>
                </div>
              ))}
              {fila.length === 0 && (
                <div className="flex items-center justify-center flex-1" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.7rem, 0.9vw, 0.9rem)' }}>
                  🎉 Fila vazia!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Resumo por status ── */}
        <div className="rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
          <div className="shrink-0 flex items-center justify-center" style={{
            background: HEADER_INFO_STATUS,
            padding: 'clamp(6px, 0.8vh, 12px) 16px',
          }}>
            <h2 className="font-bold text-white tracking-wide" style={{ fontSize: 'clamp(0.75rem, 1.3vw, 1.15rem)' }}>
              Resumo por status
            </h2>
          </div>
          <div className="flex-1 flex items-center justify-center" style={{ padding: 'clamp(12px, 1.2vw, 20px)' }}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 w-full">
              {statusSummary.map(s => (
                <div key={s.name} className="flex flex-col items-center text-center gap-2">
                  <div className="rounded-full flex items-center justify-center" style={{
                    width: 'clamp(34px, 3vw, 48px)', height: 'clamp(34px, 3vw, 48px)',
                    background: `${s.color}15`,
                    border: `1px solid ${s.color}25`,
                    color: s.color,
                  }}>
                    {getStatusIcon(s.icon, 18)}
                  </div>
                  <p className="font-semibold leading-tight" style={{ color: DARK_TEXT_MUTED, fontSize: 'clamp(0.5rem, 0.7vw, 0.7rem)' }}>{s.name}</p>
                  <div className="rounded-xl px-4 py-1" style={{
                    background: `${s.color}18`,
                    border: `1px solid ${s.color}35`,
                  }}>
                    <p className="font-black" style={{ color: s.color, fontSize: 'clamp(1.1rem, 1.8vw, 1.8rem)' }}>{s.value}</p>
                  </div>
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
