ALTER TABLE public.info_slides
  ADD COLUMN IF NOT EXISTS superintendencia text NOT NULL DEFAULT 'Stüpp';

CREATE INDEX IF NOT EXISTS idx_info_slides_superintendencia_sort
  ON public.info_slides (superintendencia, sort_order);

COMMENT ON COLUMN public.info_slides.superintendencia IS
  'Superintendência do painel: Stüpp, Nascimento ou Não identificado';
