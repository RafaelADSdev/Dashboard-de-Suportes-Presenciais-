import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Campo Bitrix: Solicitante - Usuário (vínculo de colaborador) */
const SOLICITANTE_FIELD = "UF_CRM_1749565388";
/**
 * Campos de texto "Nome do solicitante do Suporte" (varia por versão do funil).
 * Lemos o primeiro que estiver preenchido. Pode adicionar/sobrescrever via
 * BITRIX_NOME_SOLICITANTE_FIELD (lista separada por vírgula).
 */
const NOME_SOLICITANTE_SUPORTE_FIELDS = [
  ...(Deno.env.get("BITRIX_NOME_SOLICITANTE_FIELD") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  "UF_CRM_1781026116493",
  "UF_CRM_1749565390",
];
const RESPONSAVEL_FIELD = "ASSIGNED_BY_ID";

/** Texto do nome do solicitante, pegando o primeiro campo preenchido. */
function getNomeSolicitante(fields: Record<string, unknown>): string {
  for (const fieldId of NOME_SOLICITANTE_SUPORTE_FIELDS) {
    const text = extractTextField(fields[fieldId]);
    if (text) return text;
  }
  return "";
}

const FERRAMENTA_MAP: Record<string, string> = {
  "4950": "Bitrix24",
  "4938": "SIN",
  "4940": "App Hub Nogueira",
  "4942": "App PPM",
  "4944": "Portal Hub Nogueira",
  "4946": "Portal PPM",
  "4948": "Forma",
  "8030": "HubCore",
  "4952": "Outros",
};

/** Campo do card: Superintendência (origem do suporte presencial). */
const SUPERINTENDENCIA_FIELD =
  Deno.env.get("BITRIX_SUPERINTENDENCIA_FIELD") ?? "UF_CRM_1711980380";
const SUPERINTENDENCIA_FIELD_LABELS = ["Superintendência", "Superintendencia"];

/** Legado: enum antigo no card (mantido como fallback). */
const SUPERINTENDENCIA_MAP: Record<string, string> = {
  "11357": "Nascimento",
  "11359": "Stüpp",
};
const SUPERINTENDENCIA_LEGACY_FIELD = "UF_CRM_1775566080848";

/** IDs na estrutura da empresa (Bitrix department.get) */
const SUPERINTENDENCIA_NASCIMENTO_DEPT_ID =
  Deno.env.get("BITRIX_SUP_NASCIMENTO_DEPT_ID") ?? "7";
const SUPERINTENDENCIA_STUBPP_DEPT_ID =
  Deno.env.get("BITRIX_SUP_STUBPP_DEPT_ID") ?? "3";

const DEFAULT_CATEGORY_ID = Deno.env.get("BITRIX_CATEGORY_ID") ?? "54";
const DEFAULT_RESPONSAVEL_NOME = "Pedro Leal";

/**
 * Campo Bitrix usado para decidir se o card entra no painel.
 * No Bitrix do cliente, "Suporte - Resolução do chamado" é o campo PADRÃO
 * "Comentário" (COMMENTS) apenas renomeado — não é um campo personalizado.
 * Por isso lemos COMMENTS por padrão, mantendo a busca por campo
 * personalizado (UF_CRM_…) por rótulo como alternativa.
 */
const RESOLUCAO_FIELD_LABEL = "Suporte - Resolução do chamado";
const OBSERVACAO_FIELD_LABEL = "Observação";
const RESOLUCAO_FIELD_LABELS = [RESOLUCAO_FIELD_LABEL, OBSERVACAO_FIELD_LABEL];
const RESOLUCAO_FIELD =
  Deno.env.get("BITRIX_RESOLUCAO_FIELD") ??
  Deno.env.get("BITRIX_OBSERVACAO_FIELD") ??
  "";
/** Campos padrão do negócio usados como fonte da resolução (fallback). */
const RESOLUCAO_STANDARD_FIELDS = ["COMMENTS"];

/** Texto que deve aparecer no campo Observação para entrar no painel. */
const DEFAULT_PAINEL_MARKERS = ["SUPORTE PRESENCIAL NO SALÃO"];

type BitrixAuth = {
  access_token?: string;
  client_endpoint?: string;
  domain?: string;
  application_token?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeLabel(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getPainelMarkers(): Set<string> {
  const fromEnv =
    Deno.env.get("BITRIX_PAINEL_MARKERS") ??
    Deno.env.get("BITRIX_ALLOWED_TIPO_SUPORTE") ??
    Deno.env.get("BITRIX_ALLOWED_STAGE_NAMES");
  const names = fromEnv
    ? fromEnv.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_PAINEL_MARKERS;
  return new Set(names.map(normalizeLabel));
}

/** Observação (ou outro texto) contém algum marcador do painel. */
function textMatchesPainelMarker(text: string, markers: Set<string>): boolean {
  const normalized = normalizeLabel(text);
  if (!normalized) return false;
  for (const marker of markers) {
    if (normalized.includes(marker) || marker.includes(normalized)) return true;
  }
  return false;
}

function extractPainelMarker(text: string, markers: Set<string>): string {
  const normalized = normalizeLabel(text);
  for (const marker of markers) {
    if (normalized.includes(marker)) {
      const original = DEFAULT_PAINEL_MARKERS.find(
        (item) => normalizeLabel(item) === marker
      );
      return original ?? marker.toUpperCase();
    }
  }
  return text.trim().slice(0, 120);
}

function mapStageNameToStatus(name: string): string | null {
  const n = normalizeLabel(name);
  if (n.includes("presencial no sal") || (n.includes("salao") && n.includes("suporte presencial"))) {
    return "nova_solicitacao";
  }
  if (n.includes("resolucao do chamado") || (n.includes("resolucao") && n.includes("chamado"))) {
    return "em_atendimento";
  }
  if (n.includes("em atendimento")) return "em_atendimento";
  if (n.includes("aguardando solicitante")) return "aguardando_solicitante";
  if (n.includes("validar ajuste")) return "validar_ajuste";
  if (n.includes("conclu") || n.includes("won")) return "concluido";
  if (n.includes("rejeit") || n.includes("perd")) return "finalizado";
  if (n.includes("demanda supervisor")) return "nova_solicitacao";
  if (n.includes("solicita") || n.includes("triagem") || n.includes("requisi")) {
    return "nova_solicitacao";
  }
  return null;
}

function parseFormBody(formData: FormData): Record<string, unknown> {
  const flat = Object.fromEntries(formData.entries());
  const body: Record<string, unknown> = { ...flat };
  const fields: Record<string, string> = {};
  const auth: BitrixAuth = {};

  for (const [key, value] of Object.entries(flat)) {
    const fieldMatch = key.match(/^data\[FIELDS\]\[(.+)\]$/);
    if (fieldMatch) fields[fieldMatch[1]] = String(value);
    const authMatch = key.match(/^auth\[(.+)\]$/);
    if (authMatch) auth[authMatch[1] as keyof BitrixAuth] = String(value);
  }

  if (Object.keys(fields).length > 0) body.data = { FIELDS: fields };
  if (Object.keys(auth).length > 0) body.auth = auth;
  return body;
}

function getIncomingWebhookBase(): string | null {
  const url = Deno.env.get("BITRIX_INCOMING_WEBHOOK")?.trim();
  if (!url) return null;
  return url.replace(/\/$/, "");
}

function getRestBase(auth: BitrixAuth): string | null {
  const incoming = getIncomingWebhookBase();
  if (incoming) return incoming;
  if (auth.client_endpoint) return auth.client_endpoint.replace(/\/$/, "");
  if (auth.domain) return `https://${auth.domain}/rest`;
  return null;
}

function extractUserId(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "object" && value !== null && "value" in value) {
    return String((value as { value: unknown }).value);
  }
  return String(value);
}

function extractTextField(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "object" && value !== null && "value" in value) {
    return String((value as { value: unknown }).value).trim();
  }
  return String(value).trim();
}

function normalizePersonName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatUserName(user: {
  NAME?: string;
  SECOND_NAME?: string;
  LAST_NAME?: string;
}): string {
  return [user.NAME, user.SECOND_NAME, user.LAST_NAME].filter(Boolean).join(" ").trim();
}

async function fetchBitrixResult(url: string, label: string): Promise<unknown | null> {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Bitrix ${label} HTTP:`, response.status);
    return null;
  }
  const payload = await response.json();
  if (payload.error) {
    console.error(`Bitrix ${label} API:`, payload.error);
    return null;
  }
  return payload.result ?? null;
}

async function bitrixRestGet(
  auth: BitrixAuth,
  method: string,
  params: Record<string, string>,
  options?: { preferOAuth?: boolean }
): Promise<unknown> {
  const incoming = getIncomingWebhookBase();
  const base = getRestBase(auth);
  const token = auth.access_token;
  const query = new URLSearchParams(params);

  const attempts: (() => Promise<unknown | null>)[] = [];

  if (options?.preferOAuth && token && base) {
    attempts.push(() =>
      fetchBitrixResult(`${base}/${method}?${query.toString()}&auth=${token}`, `${method} (oauth)`)
    );
  }

  if (incoming) {
    attempts.push(() =>
      fetchBitrixResult(`${incoming}/${method}?${query.toString()}`, `${method} (incoming)`)
    );
  }

  if (token && base && !options?.preferOAuth) {
    attempts.push(() =>
      fetchBitrixResult(`${base}/${method}?${query.toString()}&auth=${token}`, `${method} (oauth)`)
    );
  }

  for (const attempt of attempts) {
    const result = await attempt();
    if (result !== null) return result;
  }

  return null;
}

async function fetchDealFromBitrix(dealId: string, auth: BitrixAuth) {
  const result = await bitrixRestGet(auth, "crm.deal.get", { id: dealId });
  return result && typeof result === "object" ? (result as Record<string, unknown>) : null;
}

const stageMapsCache = new Map<string, { statusMap: Record<string, string>; nameMap: Record<string, string> }>();

async function getStageMaps(auth: BitrixAuth, categoryId: string) {
  const cached = stageMapsCache.get(categoryId);
  if (cached) return cached;
  const statusMap: Record<string, string> = {};
  const nameMap: Record<string, string> = {};
  const result = await bitrixRestGet(auth, "crm.dealcategory.stage.list", { id: categoryId });
  for (const stage of Array.isArray(result) ? result : []) {
    const stageId = String((stage as { STATUS_ID?: string }).STATUS_ID || "");
    const stageName = String((stage as { NAME?: string }).NAME || "");
    if (stageId && stageName) nameMap[stageId] = stageName;
    const status = mapStageNameToStatus(stageName);
    if (stageId && status) statusMap[stageId] = status;
  }
  const maps = { statusMap, nameMap };
  stageMapsCache.set(categoryId, maps);
  return maps;
}

type DealUserFieldMeta = {
  FIELD_NAME?: string;
  EDIT_FORM_LABEL?: string;
  LIST_COLUMN_LABEL?: string;
  LIST?: Array<{ ID?: string | number; VALUE?: string }>;
};

let dealUserFieldsCache: DealUserFieldMeta[] | null = null;

async function loadDealUserFields(auth: BitrixAuth): Promise<DealUserFieldMeta[]> {
  if (dealUserFieldsCache) return dealUserFieldsCache;
  const result = await bitrixRestGet(auth, "crm.deal.userfield.list", {});
  dealUserFieldsCache = Array.isArray(result) ? (result as DealUserFieldMeta[]) : [];
  return dealUserFieldsCache;
}

function resolveUserFieldByLabel(
  userFields: DealUserFieldMeta[],
  envOverride: string,
  labelSearch: string[]
): DealUserFieldMeta | null {
  if (envOverride) {
    const byName = userFields.find(
      (field) => String(field.FIELD_NAME || "").trim() === envOverride
    );
    return byName ?? { FIELD_NAME: envOverride };
  }

  const targets = labelSearch.map((label) => normalizeLabel(label)).filter(Boolean);

  const fieldLabels = (field: DealUserFieldMeta): string[] =>
    [field.EDIT_FORM_LABEL, field.LIST_COLUMN_LABEL, field.FIELD_NAME]
      .filter(Boolean)
      .map((label) => normalizeLabel(String(label)));

  // 1ª passada: rótulo idêntico ou que contém o termo buscado (mais confiável).
  for (const target of targets) {
    for (const field of userFields) {
      if (!String(field.FIELD_NAME || "").trim()) continue;
      if (fieldLabels(field).some((label) => label === target || label.includes(target))) {
        return field;
      }
    }
  }

  // 2ª passada: termo buscado contém o rótulo (ex.: rótulo "Resolução do chamado").
  // Exige rótulo razoavelmente longo para não casar com campos curtos genéricos.
  for (const target of targets) {
    for (const field of userFields) {
      if (!String(field.FIELD_NAME || "").trim()) continue;
      if (fieldLabels(field).some((label) => label.length >= 8 && target.includes(label))) {
        return field;
      }
    }
  }

  return null;
}

/** Mapa ID → rótulo das opções de um campo lista/enum. */
function buildEnumMap(field: DealUserFieldMeta): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of field.LIST ?? []) {
    if (item.ID != null) map.set(String(item.ID), String(item.VALUE ?? "").trim());
  }
  return map;
}

/**
 * Extrai o texto de um campo que pode ser texto livre, objeto {value},
 * um ID de enum ou um array de IDs de enum.
 */
function extractFieldText(value: unknown, enumMap: Map<string, string>): string {
  const raw = Array.isArray(value)
    ? value
    : value != null && value !== ""
      ? [value]
      : [];

  const parts: string[] = [];
  for (const entry of raw) {
    const asText = extractTextField(entry);
    if (!asText) continue;
    parts.push(enumMap.get(asText) ?? asText);
  }
  return parts.join(" ").trim();
}

async function resolveResolucaoFromDeal(
  auth: BitrixAuth,
  fields: Record<string, unknown>
): Promise<{ fieldName: string | null; text: string }> {
  const userFields = await loadDealUserFields(auth);
  const field = resolveUserFieldByLabel(
    userFields,
    RESOLUCAO_FIELD,
    RESOLUCAO_FIELD_LABELS
  );
  const fieldName = field ? String(field.FIELD_NAME || "").trim() : "";

  // 1) Campo personalizado (UF_CRM_…) encontrado por rótulo.
  if (field && fieldName) {
    const enumMap = buildEnumMap(field);
    const text = extractFieldText(fields[fieldName], enumMap);
    if (text) {
      return { fieldName, text };
    }
  }

  // 2) Fallback: campo PADRÃO do negócio (ex.: COMMENTS), pois no Bitrix do
  // cliente "Suporte - Resolução do chamado" é o campo Comentário renomeado.
  for (const std of RESOLUCAO_STANDARD_FIELDS) {
    const text = extractFieldText(fields[std], new Map());
    if (text) {
      return { fieldName: std, text };
    }
  }

  console.log("[painel] campo de resolucao NAO encontrado/vazio. Rotulos disponiveis:", {
    buscando: RESOLUCAO_FIELD_LABELS,
    env_override: RESOLUCAO_FIELD || null,
    standard_tentados: RESOLUCAO_STANDARD_FIELDS,
    labels: userFields.map((f) => ({
      field: f.FIELD_NAME,
      edit: f.EDIT_FORM_LABEL,
      list: f.LIST_COLUMN_LABEL,
    })),
  });
  return { fieldName: null, text: "" };
}

type DeptInfo = {
  id: string;
  name: string;
  parent: string | null;
};

type BitrixUserInfo = {
  name: string;
  photo: string | null;
  departamento: string | null;
  superintendencia: string | null;
};

function normalizeDeptName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function superintendenciaFromDeptName(name: string): string | null {
  const n = normalizeDeptName(name);
  if (n.includes("SUPERINTENDENCIA NASCIMENTO")) return "Nascimento";
  if (n.includes("SUPERINTENDENCIA STUPP") || n.includes("SUPERINTENDENCIA STUP")) {
    return "Stüpp";
  }
  return null;
}

/** Texto do campo Superintendência no card → aba do painel. */
function superintendenciaFromCardValue(text: string): string | null {
  const n = normalizeDeptName(text);
  if (n.includes("NASCIMENTO")) return "Nascimento";
  if (n.includes("STUBP") || n.includes("STUPP") || n.includes("STUP")) return "Stüpp";
  return null;
}

async function resolveSuperintendenciaFromDeal(
  auth: BitrixAuth,
  fields: Record<string, unknown>
): Promise<string | null> {
  const userFields = await loadDealUserFields(auth);
  const field =
    resolveUserFieldByLabel(userFields, SUPERINTENDENCIA_FIELD, SUPERINTENDENCIA_FIELD_LABELS) ??
    userFields.find((item) => String(item.FIELD_NAME || "").trim() === SUPERINTENDENCIA_FIELD) ??
    null;

  const fieldName = field
    ? String(field.FIELD_NAME || "").trim()
    : SUPERINTENDENCIA_FIELD;
  const enumMap = field ? buildEnumMap(field) : new Map<string, string>();
  const text = extractFieldText(fields[fieldName], enumMap);
  if (!text) return null;

  const fromCard = superintendenciaFromCardValue(text);
  if (fromCard) return fromCard;

  console.log("[painel] superintendencia no card sem mapeamento conhecido", {
    field: fieldName,
    valor: text,
  });
  return null;
}

function extractDepartmentIds(value: unknown): string[] {
  const ids = Array.isArray(value)
    ? value
    : value != null && value !== ""
      ? [value]
      : [];
  return ids.map((id) => String(id)).filter((id) => id && id !== "0");
}

async function getDepartment(
  auth: BitrixAuth,
  depId: string,
  cache: Map<string, DeptInfo>
): Promise<DeptInfo | null> {
  if (cache.has(depId)) return cache.get(depId)!;

  const result = await bitrixRestGet(auth, "department.get", { ID: depId }, { preferOAuth: true });
  const dep = Array.isArray(result) ? result[0] : result;
  if (!dep || typeof dep !== "object") return null;

  const record = dep as { ID?: string | number; NAME?: string; PARENT?: string | number };
  const name = String(record.NAME || "").trim();
  if (!name) return null;

  const parentRaw = record.PARENT;
  const parent =
    parentRaw != null && String(parentRaw) !== "" && String(parentRaw) !== "0"
      ? String(parentRaw)
      : null;

  const info: DeptInfo = { id: depId, name, parent };
  cache.set(depId, info);
  return info;
}

async function resolveEquipeDepartamento(
  auth: BitrixAuth,
  departmentIds: unknown,
  cache: Map<string, DeptInfo>
): Promise<string | null> {
  const equipes: string[] = [];
  const fallback: string[] = [];

  for (const depId of extractDepartmentIds(departmentIds)) {
    const dept = await getDepartment(auth, depId, cache);
    if (!dept?.name) continue;
    if (superintendenciaFromDeptName(dept.name)) {
      fallback.push(dept.name);
    } else {
      equipes.push(dept.name);
    }
  }

  if (equipes.length) return equipes.join(", ");
  return fallback.length ? fallback.join(", ") : null;
}

async function resolveDepartmentNames(
  auth: BitrixAuth,
  departmentIds: unknown,
  cache: Map<string, DeptInfo>
): Promise<string | null> {
  const names: string[] = [];
  for (const depId of extractDepartmentIds(departmentIds)) {
    const dept = await getDepartment(auth, depId, cache);
    if (dept?.name) names.push(dept.name);
  }
  return names.length ? names.join(", ") : null;
}

async function resolveSuperintendenciaFromDepartments(
  auth: BitrixAuth,
  departmentIds: unknown,
  cache: Map<string, DeptInfo>
): Promise<string | null> {
  for (const startId of extractDepartmentIds(departmentIds)) {
    let current: string | null = startId;
    const visited = new Set<string>();

    while (current && !visited.has(current)) {
      visited.add(current);

      if (current === SUPERINTENDENCIA_NASCIMENTO_DEPT_ID) return "Nascimento";
      if (current === SUPERINTENDENCIA_STUBPP_DEPT_ID) return "Stüpp";

      const dept = await getDepartment(auth, current, cache);
      if (!dept) break;

      const byName = superintendenciaFromDeptName(dept.name);
      if (byName) return byName;

      current = dept.parent;
    }
  }

  return null;
}

async function resolveUser(
  auth: BitrixAuth,
  userId: string,
  cache: Map<string, BitrixUserInfo>,
  departmentCache: Map<string, DeptInfo>
): Promise<BitrixUserInfo> {
  if (!userId || userId === "0") {
    return { name: "Não informado", photo: null, departamento: null, superintendencia: null };
  }
  if (cache.has(userId)) return cache.get(userId)!;

  const result = await bitrixRestGet(auth, "user.get", { ID: userId });
  const users = Array.isArray(result) ? result : result ? [result] : [];
  const user = users[0] as {
    NAME?: string;
    SECOND_NAME?: string;
    LAST_NAME?: string;
    PERSONAL_PHOTO?: string;
    UF_DEPARTMENT?: unknown;
  } | undefined;
  const name = user
    ? formatUserName(user)
    : userId;
  const photo = user?.PERSONAL_PHOTO?.trim() || null;
  const departamento = user
    ? await resolveEquipeDepartamento(auth, user.UF_DEPARTMENT, departmentCache)
    : null;
  const superintendencia = user
    ? await resolveSuperintendenciaFromDepartments(auth, user.UF_DEPARTMENT, departmentCache)
    : null;

  const info: BitrixUserInfo = {
    name: name || userId,
    photo,
    departamento,
    superintendencia,
  };
  cache.set(userId, info);
  return info;
}

async function searchUserIdByName(auth: BitrixAuth, fullName: string): Promise<string | null> {
  const query = fullName.trim();
  if (!query || query.length < 2) return null;

  const result = await bitrixRestGet(auth, "user.get", {
    "FILTER[NAME_SEARCH]": query,
    "FILTER[ACTIVE]": "true",
  });

  const users = (Array.isArray(result) ? result : []) as Array<{
    ID?: string | number;
    NAME?: string;
    SECOND_NAME?: string;
    LAST_NAME?: string;
  }>;

  if (!users.length) return null;

  const target = normalizePersonName(query);
  const exact = users.find((user) => normalizePersonName(formatUserName(user)) === target);
  if (exact?.ID) return String(exact.ID);

  const partial = users.find((user) => {
    const name = normalizePersonName(formatUserName(user));
    return name.includes(target) || target.includes(name);
  });
  if (partial?.ID) return String(partial.ID);

  return users[0]?.ID ? String(users[0].ID) : null;
}

async function resolveSolicitante(
  auth: BitrixAuth,
  fields: Record<string, unknown>,
  userCache: Map<string, BitrixUserInfo>,
  departmentCache: Map<string, DeptInfo>
): Promise<BitrixUserInfo> {
  const nomeTexto = getNomeSolicitante(fields);
  let userId = extractUserId(fields[SOLICITANTE_FIELD]);

  if (!userId && nomeTexto) {
    userId = (await searchUserIdByName(auth, nomeTexto)) ?? "";
  }

  const empty: BitrixUserInfo = {
    name: "Não informado",
    photo: null,
    departamento: null,
    superintendencia: null,
  };

  if (!userId && !nomeTexto) return empty;

  const profile = userId
    ? await resolveUser(auth, userId, userCache, departmentCache)
    : empty;

  const name = nomeTexto || profile.name || "Não informado";

  console.log("[painel] solicitante resolvido", {
    nome_texto: nomeTexto || null,
    user_id: userId || null,
    nome_final: name,
    departamento: profile.departamento,
    superintendencia: profile.superintendencia,
  });

  return {
    name,
    photo: profile.photo,
    departamento: profile.departamento,
    superintendencia: profile.superintendencia,
  };
}

function isSupportPipeline(fields: Record<string, unknown>): boolean {
  const categoryId = String(fields.CATEGORY_ID ?? DEFAULT_CATEGORY_ID);
  const stageId = String(fields.STAGE_ID ?? "");
  const allowedCategory = Deno.env.get("BITRIX_CATEGORY_ID") ?? DEFAULT_CATEGORY_ID;
  if (categoryId === allowedCategory) return true;
  if (stageId.startsWith(`C${allowedCategory}:`)) return true;
  return false;
}

function isResponsavelPermitido(assignedById: string, responsavelNome: string): boolean {
  if (Deno.env.get("BITRIX_FILTRAR_PEDRO_LEAL") !== "true") return true;

  const alvoNome = (Deno.env.get("BITRIX_RESPONSAVEL_NOME") ?? DEFAULT_RESPONSAVEL_NOME)
    .trim()
    .toLowerCase();
  const alvoId = Deno.env.get("BITRIX_PEDRO_LEAL_USER_ID") ?? "";

  if (alvoId && assignedById === alvoId) return true;
  if (responsavelNome.trim().toLowerCase() === alvoNome) return true;
  return false;
}

async function mapDealToTicket(
  fields: Record<string, unknown>,
  auth: BitrixAuth,
  userCache: Map<string, BitrixUserInfo>,
  departmentCache: Map<string, DeptInfo>,
  stageStatusMap: Record<string, string>,
  painelMarker: string
) {
  const stageId = String(fields.STAGE_ID || "");
  const status = stageStatusMap[stageId] || "nova_solicitacao";
  const ferramentaValue = String(fields.UF_CRM_1749565443085 || "");
  const supValue = String(fields[SUPERINTENDENCIA_LEGACY_FIELD] || "");

  const responsavelId = extractUserId(fields[RESPONSAVEL_FIELD]);

  const solicitanteInfo = await resolveSolicitante(auth, fields, userCache, departmentCache);

  const responsavelInfo = responsavelId
    ? await resolveUser(auth, responsavelId, userCache, departmentCache)
    : { name: "Não informado", photo: null, departamento: null, superintendencia: null };

  const superintendenciaFromCard = await resolveSuperintendenciaFromDeal(auth, fields);

  // Prioridade: campo Superintendência no card → legado no card → estrutura do colaborador.
  const superintendencia =
    superintendenciaFromCard ||
    SUPERINTENDENCIA_MAP[supValue] ||
    solicitanteInfo.superintendencia ||
    "Não identificado";

  console.log("[painel] superintendencia resolvida", {
    deal_id: String(fields.ID || fields.id || ""),
    campo_card: superintendenciaFromCard,
    legado_enum: SUPERINTENDENCIA_MAP[supValue] ?? null,
    pelo_colaborador: solicitanteInfo.superintendencia,
    final: superintendencia,
  });

  return {
    ticket_id: String(fields.ID || fields.id || ""),
    titulo: String(
      fields.TITLE || getNomeSolicitante(fields) || "Suporte Presencial"
    ),
    solicitante: solicitanteInfo.name,
    solicitante_foto: solicitanteInfo.photo,
    responsavel: responsavelInfo.name,
    departamento: solicitanteInfo.departamento || "-",
    ferramenta: FERRAMENTA_MAP[ferramentaValue] || "Outros",
    status,
    estagio_bitrix: painelMarker,
    superintendencia,
    criado_em: fields.DATE_CREATE
      ? new Date(String(fields.DATE_CREATE)).toISOString()
      : new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    resolvido_em: status === "concluido" ? new Date().toISOString() : null,
  };
}

function hasBitrixApiAccess(auth: BitrixAuth): boolean {
  return !!(getIncomingWebhookBase() || auth.access_token);
}

type ProcessDealResult =
  | { outcome: "synced"; deal_id: string }
  | { outcome: "skipped"; deal_id: string; reason: string; details?: Record<string, unknown> }
  | { outcome: "removed"; deal_id: string; reason: string }
  | { outcome: "error"; deal_id: string; error: string };

async function processDealForPainel(
  fields: Record<string, unknown>,
  auth: BitrixAuth,
  supabase: ReturnType<typeof createClient>
): Promise<ProcessDealResult> {
  const dealId = String(fields.ID || fields.id || "");

  console.log("[painel] deal recebido", {
    deal_id: dealId,
    category_id: fields.CATEGORY_ID,
    stage_id: fields.STAGE_ID,
  });

  if (!isSupportPipeline(fields)) {
    console.log("[painel] descartado: fora do funil de suporte", {
      deal_id: dealId,
      category_id: fields.CATEGORY_ID,
    });
    return {
      outcome: "skipped",
      deal_id: dealId,
      reason: "Fora do funil de suporte",
      details: {
        category_id: fields.CATEGORY_ID,
        stage_id: fields.STAGE_ID,
      },
    };
  }

  const categoryId = String(fields.CATEGORY_ID ?? DEFAULT_CATEGORY_ID);
  const userCache = new Map<string, BitrixUserInfo>();
  const departmentCache = new Map<string, DeptInfo>();
  const { statusMap: stageStatusMap } = await getStageMaps(auth, categoryId);

  const { fieldName: resolucaoField, text: resolucaoText } = await resolveResolucaoFromDeal(
    auth,
    fields
  );
  const painelMarkers = getPainelMarkers();

  console.log("[painel] resolucao do chamado", {
    deal_id: dealId,
    resolucao_field: resolucaoField,
    resolucao_text: resolucaoText,
    painel_markers: [...painelMarkers],
    matched: textMatchesPainelMarker(resolucaoText, painelMarkers),
  });

  // Campo de resolução vazio/ausente: o card simplesmente não é do painel.
  // Removemos do banco (se existir) e seguimos sem erro.
  if (!resolucaoField) {
    await supabase.from("tickets").delete().eq("ticket_id", dealId);
    return {
      outcome: "removed",
      deal_id: dealId,
      reason: "Campo de resolução vazio/ausente",
    };
  }

  if (!textMatchesPainelMarker(resolucaoText, painelMarkers)) {
    await supabase.from("tickets").delete().eq("ticket_id", dealId);
    return {
      outcome: "removed",
      deal_id: dealId,
      reason: "Campo de resolução sem marcador do painel",
    };
  }

  const responsavelId = extractUserId(fields[RESPONSAVEL_FIELD]);
  const responsavelInfo = responsavelId
    ? await resolveUser(auth, responsavelId, userCache, departmentCache)
    : { name: "Não informado", photo: null, departamento: null, superintendencia: null };

  const { data: existing } = await supabase
    .from("tickets")
    .select("ticket_id")
    .eq("ticket_id", dealId)
    .maybeSingle();

  if (!existing && !isResponsavelPermitido(responsavelId, responsavelInfo.name)) {
    return {
      outcome: "skipped",
      deal_id: dealId,
      reason: "Responsável não é Pedro Leal",
      details: { responsavel: responsavelInfo.name },
    };
  }

  const painelMarker = extractPainelMarker(resolucaoText, painelMarkers);

  const ticketData = await mapDealToTicket(
    fields,
    auth,
    userCache,
    departmentCache,
    stageStatusMap,
    painelMarker
  );

  const { error } = await supabase
    .from("tickets")
    .upsert(ticketData, { onConflict: "ticket_id" });

  if (error) {
    console.log("[painel] ERRO no upsert", { deal_id: dealId, error: error.message });
    return { outcome: "error", deal_id: dealId, error: error.message };
  }

  console.log("[painel] card gravado com sucesso", {
    deal_id: dealId,
    estagio_bitrix: painelMarker,
    status: ticketData.status,
  });
  return { outcome: "synced", deal_id: dealId };
}

async function syncDealsFromPipeline(
  supabase: ReturnType<typeof createClient>
): Promise<Response> {
  const auth: BitrixAuth = {};
  const categoryId = Deno.env.get("BITRIX_CATEGORY_ID") ?? DEFAULT_CATEGORY_ID;

  if (!getIncomingWebhookBase()) {
    return jsonResponse({
      error: "BITRIX_INCOMING_WEBHOOK não configurado para sincronização.",
    }, 503);
  }

  // O painel só mostra cards criados HOJE (fuso BRT). Para não estourar o
  // limite de recursos da função, sincronizamos apenas os cards recentes
  // (últimos ~2 dias), o que cobre "hoje" mesmo com diferença de fuso.
  const syncDays = Number(Deno.env.get("BITRIX_SYNC_DAYS") ?? "2");
  const sinceDate = new Date(Date.now() - syncDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let start = 0;
  const summary = {
    synced: 0,
    skipped: 0,
    removed: 0,
    since: sinceDate,
    errors: [] as Array<{ deal_id: string; error: string }>,
  };

  while (true) {
    const page = await bitrixRestGet(auth, "crm.deal.list", {
      start: String(start),
      "filter[CATEGORY_ID]": categoryId,
      "filter[>=DATE_CREATE]": sinceDate,
      "order[DATE_CREATE]": "DESC",
      "select[]": "ID",
    });

    const deals = Array.isArray(page) ? page : [];
    if (!deals.length) break;

    for (const deal of deals) {
      const dealId = String((deal as { ID?: string | number }).ID || "");
      if (!dealId) continue;

      const fullDeal = await fetchDealFromBitrix(dealId, auth);
      if (!fullDeal) {
        summary.errors.push({ deal_id: dealId, error: "crm.deal.get falhou" });
        continue;
      }

      const result = await processDealForPainel(fullDeal, auth, supabase);
      if (result.outcome === "synced") summary.synced++;
      else if (result.outcome === "skipped") summary.skipped++;
      else if (result.outcome === "removed") summary.removed++;
      else if (result.outcome === "error") {
        summary.errors.push({ deal_id: result.deal_id, error: result.error });
      }
    }

    if (deals.length < 50) break;
    start += 50;
  }

  return jsonResponse({ success: true, action: "sync", ...summary });
}

function isSyncAuthorized(req: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (serviceKey && authHeader === `Bearer ${serviceKey}`) return true;

  const syncSecret = Deno.env.get("BITRIX_SYNC_SECRET");
  if (syncSecret && req.headers.get("x-bitrix-sync-secret") === syncSecret) return true;

  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const isSync = url.searchParams.get("action") === "sync";

  if (isSync) {
    if (req.method !== "POST" && req.method !== "GET") {
      return jsonResponse({ error: "Método não permitido" }, 405);
    }
    if (!isSyncAuthorized(req)) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    return syncDealsFromPipeline(supabase);
  }

  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const expectedToken = Deno.env.get("BITRIX_APP_TOKEN");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const contentType = req.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await req.json()
      : parseFormBody(await req.formData());

    const auth = (body.auth ?? {}) as BitrixAuth;
    const appToken = auth.application_token || body.application_token;
    if (expectedToken && appToken !== expectedToken) {
      return jsonResponse({ error: "Token do aplicativo inválido" }, 401);
    }

    let fields = (body?.data?.FIELDS ?? body?.FIELDS ?? body) as Record<string, unknown>;
    const dealId = String(fields.ID || fields.id || "");
    if (!dealId) return jsonResponse({ error: "ID do deal não encontrado" }, 400);

    if (!hasBitrixApiAccess(auth)) {
      return jsonResponse({
        error: "Sem acesso à API Bitrix. Configure BITRIX_INCOMING_WEBHOOK nos secrets do Supabase.",
        deal_id: dealId,
      }, 503);
    }

    const fullDeal = await fetchDealFromBitrix(dealId, auth);
    if (fullDeal) fields = fullDeal;

    const result = await processDealForPainel(fields, auth, supabase);

    if (result.outcome === "error") {
      return jsonResponse({ error: result.error, deal_id: result.deal_id }, 500);
    }

    if (result.outcome === "skipped") {
      return jsonResponse({
        success: true,
        skipped: true,
        reason: result.reason,
        deal_id: result.deal_id,
        ...result.details,
      });
    }

    if (result.outcome === "removed") {
      const { fieldName: resolucaoField, text: resolucaoText } = await resolveResolucaoFromDeal(
        auth,
        fields
      );
      return jsonResponse({
        success: true,
        skipped: true,
        reason: result.reason,
        resolucao_field: resolucaoField,
        resolucao: resolucaoText || null,
        painel_markers: [...getPainelMarkers()],
        deal_id: result.deal_id,
      });
    }

    const { fieldName: resolucaoField, text: resolucaoText } = await resolveResolucaoFromDeal(
      auth,
      fields
    );

    const { data } = await supabase
      .from("tickets")
      .select("*")
      .eq("ticket_id", dealId)
      .maybeSingle();

    return jsonResponse({
      success: true,
      ticket: data,
      deal_id: dealId,
      resolucao_field: resolucaoField,
      resolucao: resolucaoText,
      stage_id: fields.STAGE_ID,
    });
  } catch (err) {
    console.error("Erro no webhook:", err);
    return jsonResponse({
      error: err instanceof Error ? err.message : "Erro desconhecido",
    }, 500);
  }
});
