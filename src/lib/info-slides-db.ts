import { isSupabaseConfigured, supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type InfoSlide = {
  id: string;
  type: 'text' | 'image';
  title: string;
  content: string;
};

type InfoSlideRow = Tables<'info_slides'>;

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase não configurado.');
  }
  return supabase;
}

function rowToSlide(row: InfoSlideRow): InfoSlide {
  return {
    id: row.id,
    type: row.type === 'image' ? 'image' : 'text',
    title: row.title,
    content: row.content,
  };
}

export async function fetchInfoSlides(superintendencia: string): Promise<InfoSlide[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('info_slides')
    .select('*')
    .eq('superintendencia', superintendencia)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(rowToSlide);
}

export async function createInfoSlide(
  superintendencia: string,
  slide: Pick<InfoSlide, 'type' | 'title' | 'content'>,
  sortOrder: number
): Promise<InfoSlide> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('info_slides')
    .insert({
      superintendencia,
      type: slide.type,
      title: slide.title,
      content: slide.content,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) throw error;
  return rowToSlide(data);
}

export async function deleteInfoSlide(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('info_slides').delete().eq('id', id);
  if (error) throw error;
}

export function subscribeInfoSlides(superintendencia: string, onChange: () => void) {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  const client = supabase;

  const channel = client
    .channel(`info-slides-${superintendencia}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'info_slides' },
      payload => {
        const record = payload.new as { superintendencia?: string } | null;
        const oldRecord = payload.old as { superintendencia?: string } | null;
        const sup = record?.superintendencia ?? oldRecord?.superintendencia;
        if (sup === superintendencia) onChange();
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
