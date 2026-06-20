-- Reset diário: remove tickets cujo "Criado em" (criado_em / DATE_CREATE Bitrix)
-- é de dia anterior. Executa à meia-noite em America/Sao_Paulo (03:00 UTC).
--
-- Requer extensão pg_cron habilitada no Supabase Dashboard → Database → Extensions.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset-daily-tickets') THEN
    PERFORM cron.unschedule('reset-daily-tickets');
  END IF;
END $$;

SELECT cron.schedule(
  'reset-daily-tickets',
  '0 3 * * *',
  $$
    DELETE FROM public.tickets
    WHERE (criado_em::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date
        < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;
  $$
);
