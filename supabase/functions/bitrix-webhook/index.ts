import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Campo Bitrix: Solicitante - Usuário */
const SOLICITANTE_FIELD = "UF_CRM_1749565388";
const RESPONSAVEL_FIELD = "ASSIGNED_BY_ID";

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

const SUPERINTENDENCIA_MAP: Record<string, string> = {
  "11357": "Nascimento",
  "11359": "Stüpp",
};

/** IDs na estrutura da empresa (Bitrix department.get) */
const SUPERINTENDENCIA_NASCIMENTO_DEPT_ID =
  Deno.env.get("BITRIX_SUP_NASCIMENTO_DEPT_ID") ?? "7";
const SUPERINTENDENCIA_STUBPP_DEPT_ID =
  Deno.env.get("BITRIX_SUP_STUBPP_DEPT_ID") ?? "3";

const DEFAULT_CATEGORY_ID = Deno.env.get("BITRIX_CATEGORY_ID") ?? "54";
const DEFAULT_RESPONSAVEL_NOME = "Pedro Leal";

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

function mapStageNameToStatus(name: string): string | null {
  const n = name.toLowerCase();
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

async function getStageStatusMap(auth: BitrixAuth, categoryId: string) {
  const map: Record<string, string> = {};
  const result = await bitrixRestGet(auth, "crm.dealcategory.stage.list", { id: categoryId });
  for (const stage of Array.isArray(result) ? result : []) {
    const stageId = String((stage as { STATUS_ID?: string }).STATUS_ID || "");
    const stageName = String((stage as { NAME?: string }).NAME || "");
    const status = mapStageNameToStatus(stageName);
    if (stageId && status) map[stageId] = status;
  }
  return map;
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
    ? [user.NAME, user.SECOND_NAME, user.LAST_NAME].filter(Boolean).join(" ").trim()
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

function isSupportPipeline(fields: Record<string, unknown>): boolean {
  const categoryId = String(fields.CATEGORY_ID ?? DEFAULT_CATEGORY_ID);
  const stageId = String(fields.STAGE_ID ?? "");
  const allowedCategory = Deno.env.get("BITRIX_CATEGORY_ID") ?? DEFAULT_CATEGORY_ID;
  if (categoryId === allowedCategory) return true;
  if (stageId.startsWith(`C${allowedCategory}:`)) return true;
  return false;
}

function isResponsavelPermitido(assignedById: string, responsavelNome: string): boolean {
  if (Deno.env.get("BITRIX_FILTRAR_PEDRO_LEAL") === "false") return true;

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
  stageStatusMap: Record<string, string>
) {
  const stageId = String(fields.STAGE_ID || "");
  const status = stageStatusMap[stageId] || "nova_solicitacao";
  const ferramentaValue = String(fields.UF_CRM_1749565443085 || "");
  const supValue = String(fields.UF_CRM_1775566080848 || "");

  const solicitanteId = extractUserId(fields[SOLICITANTE_FIELD]);
  const responsavelId = extractUserId(fields[RESPONSAVEL_FIELD]);

  const solicitanteInfo = solicitanteId
    ? await resolveUser(auth, solicitanteId, userCache, departmentCache)
    : { name: "Não informado", photo: null, departamento: null, superintendencia: null };

  const responsavelInfo = responsavelId
    ? await resolveUser(auth, responsavelId, userCache, departmentCache)
    : { name: "Não informado", photo: null, departamento: null, superintendencia: null };

  const superintendencia =
    solicitanteInfo.superintendencia ||
    SUPERINTENDENCIA_MAP[supValue] ||
    "Stüpp";

  return {
    ticket_id: String(fields.ID || fields.id || ""),
    titulo: String(fields.TITLE || fields.UF_CRM_1749565390 || "Suporte Presencial"),
    solicitante: solicitanteInfo.name,
    solicitante_foto: solicitanteInfo.photo,
    responsavel: responsavelInfo.name,
    departamento: solicitanteInfo.departamento || "-",
    ferramenta: FERRAMENTA_MAP[ferramentaValue] || "Outros",
    status,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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

    if (!isSupportPipeline(fields)) {
      return jsonResponse({
        success: true,
        skipped: true,
        reason: "Fora do funil de suporte",
        category_id: fields.CATEGORY_ID,
        stage_id: fields.STAGE_ID,
      });
    }

    const categoryId = String(fields.CATEGORY_ID ?? DEFAULT_CATEGORY_ID);
    const userCache = new Map<string, BitrixUserInfo>();
    const departmentCache = new Map<string, DeptInfo>();
    const stageStatusMap = await getStageStatusMap(auth, categoryId);

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
      return jsonResponse({
        success: true,
        skipped: true,
        reason: "Responsável não é Pedro Leal",
        responsavel: responsavelInfo.name,
        deal_id: dealId,
      });
    }

    const ticketData = await mapDealToTicket(
      fields,
      auth,
      userCache,
      departmentCache,
      stageStatusMap
    );

    const { data, error } = await supabase
      .from("tickets")
      .upsert(ticketData, { onConflict: "ticket_id" })
      .select();

    if (error) {
      console.error("Erro ao salvar ticket:", error);
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({
      success: true,
      ticket: data,
      deal_id: dealId,
      stage_id: fields.STAGE_ID,
      status: ticketData.status,
      responsavel: ticketData.responsavel,
      solicitante: ticketData.solicitante,
      superintendencia: ticketData.superintendencia,
    });
  } catch (err) {
    console.error("Erro no webhook:", err);
    return jsonResponse({
      error: err instanceof Error ? err.message : "Erro desconhecido",
    }, 500);
  }
});
