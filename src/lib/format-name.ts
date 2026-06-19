/** Exibe no máximo 3 partes do nome (nome, sobrenome, terceiro nome). */
export function formatarNomeExibicao(nome: string, maxPartes = 3): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return nome.trim();
  return partes.slice(0, maxPartes).join(' ');
}
