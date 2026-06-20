/** Dispara sincronização em lote Bitrix → Supabase (requer VITE_BITRIX_SYNC_SECRET). */
export async function triggerBitrixSync(): Promise<void> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const secret = import.meta.env.VITE_BITRIX_SYNC_SECRET;
  if (!baseUrl || !secret) return;

  try {
    await fetch(`${baseUrl}/functions/v1/bitrix-webhook?action=sync`, {
      method: 'POST',
      headers: { 'x-bitrix-sync-secret': secret },
    });
  } catch {
    // Falha silenciosa — o realtime continua funcionando via webhook.
  }
}
