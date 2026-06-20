// Script LOCAL de diagnóstico (somente leitura) para o painel "Suporte Presencial no Salão".
//
// Ele reproduz a mesma lógica da edge function bitrix-webhook para descobrir:
//   1) Qual campo do funil casa com "Suporte - Resolução do chamado".
//   2) Qual valor esse campo tem num card específico (resolvendo enum/lista -> texto).
//   3) Se esse valor casa com o marcador "SUPORTE PRESENCIAL NO SALÃO".
//
// NÃO escreve nada no banco e NÃO altera a função em produção. Só lê o Bitrix.
//
// Como usar (PowerShell):
//   $env:BITRIX_INCOMING_WEBHOOK="https://SEU_PORTAL.bitrix24.com.br/rest/123/xxxxxxxx/"
//   node scripts/diagnostico-bitrix.mjs --deal=2270999
//
// Ou colocando o webhook num arquivo .env / .env.local na raiz:
//   BITRIX_INCOMING_WEBHOOK=https://SEU_PORTAL.bitrix24.com.br/rest/123/xxxxxxxx/
//   node scripts/diagnostico-bitrix.mjs --deal=2270999
//
// O --deal é opcional: sem ele, o script só lista os campos do funil.

import { readFileSync } from "node:fs";

// ---- Config (mesmos defaults da edge function) ----
const RESOLUCAO_FIELD_LABELS = ["Suporte - Resolução do chamado", "Observação"];
const DEFAULT_PAINEL_MARKERS = ["SUPORTE PRESENCIAL NO SALÃO"];
// No Bitrix do cliente, "Suporte - Resolução do chamado" é o campo PADRÃO
// "Comentário" (COMMENTS) renomeado — não é campo personalizado.
const RESOLUCAO_STANDARD_FIELDS = ["COMMENTS"];

// ---- Lê variáveis de .env / .env.local sem dependências ----
function loadEnvFile(path) {
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // arquivo não existe — tudo bem
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

// ---- Args ----
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

const webhook =
  args.webhook ||
  process.env.BITRIX_INCOMING_WEBHOOK ||
  process.env.VITE_BITRIX_INCOMING_WEBHOOK;
const dealId = args.deal || args.id || null;
const resolucaoFieldOverride =
  process.env.BITRIX_RESOLUCAO_FIELD || process.env.BITRIX_OBSERVACAO_FIELD || "";

if (!webhook) {
  console.error(
    [
      "",
      "Faltou o BITRIX_INCOMING_WEBHOOK.",
      "",
      "Onde encontrar: no Bitrix24 -> Desenvolvedor -> Outras -> 'Webhook de entrada'",
      "(ou reutilize o webhook de entrada já criado para esta integração).",
      "A URL tem o formato: https://SEU_PORTAL.bitrix24.com.br/rest/<id>/<token>/",
      "",
      "Depois rode, por exemplo:",
      '  $env:BITRIX_INCOMING_WEBHOOK="https://SEU_PORTAL.bitrix24.com.br/rest/123/xxxx/"',
      "  node scripts/diagnostico-bitrix.mjs --deal=NUMERO_DO_CARD",
      "",
    ].join("\n")
  );
  process.exit(1);
}

const base = webhook.replace(/\/$/, "");

// ---- Mesmas funções de normalização/casamento da edge function ----
function normalizeLabel(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function resolveUserFieldByLabel(userFields, envOverride, labelSearch) {
  if (envOverride) {
    const byName = userFields.find(
      (f) => String(f.FIELD_NAME || "").trim() === envOverride
    );
    return byName ?? { FIELD_NAME: envOverride };
  }
  const targets = labelSearch.map(normalizeLabel).filter(Boolean);
  const fieldLabels = (f) =>
    [f.EDIT_FORM_LABEL, f.LIST_COLUMN_LABEL, f.FIELD_NAME]
      .filter(Boolean)
      .map((l) => normalizeLabel(String(l)));

  for (const target of targets) {
    for (const f of userFields) {
      if (!String(f.FIELD_NAME || "").trim()) continue;
      if (fieldLabels(f).some((l) => l === target || l.includes(target))) return f;
    }
  }
  for (const target of targets) {
    for (const f of userFields) {
      if (!String(f.FIELD_NAME || "").trim()) continue;
      if (fieldLabels(f).some((l) => l.length >= 8 && target.includes(l))) return f;
    }
  }
  return null;
}

function buildEnumMap(field) {
  const map = new Map();
  for (const item of field?.LIST ?? []) {
    if (item.ID != null) map.set(String(item.ID), String(item.VALUE ?? "").trim());
  }
  return map;
}

function extractTextField(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object" && value !== null && "value" in value) {
    return String(value.value).trim();
  }
  return String(value).trim();
}

function extractFieldText(value, enumMap) {
  const raw = Array.isArray(value) ? value : value != null && value !== "" ? [value] : [];
  const parts = [];
  for (const entry of raw) {
    const asText = extractTextField(entry);
    if (!asText) continue;
    parts.push(enumMap.get(asText) ?? asText);
  }
  return parts.join(" ").trim();
}

function textMatchesPainelMarker(text, markers) {
  const normalized = normalizeLabel(text);
  if (!normalized) return false;
  for (const marker of markers) {
    if (normalized.includes(marker) || marker.includes(normalized)) return true;
  }
  return false;
}

// ---- Chamadas REST ----
async function bitrixGet(method, params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${base}/${method}${query ? `?${query}` : ""}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (json.error) {
    throw new Error(`${method}: ${json.error} ${json.error_description ?? ""}`);
  }
  return json.result;
}

async function main() {
  console.log("== Diagnóstico Bitrix (somente leitura) ==");
  console.log("Webhook base:", base.replace(/\/[^/]+\/?$/, "/****/"));
  console.log("");

  const userFields = (await bitrixGet("crm.deal.userfield.list")) || [];
  console.log(`Campos personalizados do funil encontrados: ${userFields.length}`);

  const markers = new Set(DEFAULT_PAINEL_MARKERS.map(normalizeLabel));
  const matched = resolveUserFieldByLabel(userFields, resolucaoFieldOverride, RESOLUCAO_FIELD_LABELS);

  console.log("");
  console.log("-- Campo escolhido para 'Suporte - Resolução do chamado' --");
  if (matched) {
    console.log({
      FIELD_NAME: matched.FIELD_NAME,
      EDIT_FORM_LABEL: matched.EDIT_FORM_LABEL,
      LIST_COLUMN_LABEL: matched.LIST_COLUMN_LABEL,
      opcoes_lista: (matched.LIST ?? []).map((o) => ({ ID: o.ID, VALUE: o.VALUE })),
    });
  } else {
    console.log("NENHUM campo casou. Veja a lista completa abaixo e me diga qual é o certo.");
  }

  console.log("");
  console.log("-- TODOS os campos (FIELD_NAME | EDIT_FORM_LABEL | LIST_COLUMN_LABEL) --");
  for (const f of userFields) {
    const edit = Array.isArray(f.EDIT_FORM_LABEL)
      ? f.EDIT_FORM_LABEL.join("/")
      : f.EDIT_FORM_LABEL?.pt || f.EDIT_FORM_LABEL?.br || f.EDIT_FORM_LABEL || "";
    const list = Array.isArray(f.LIST_COLUMN_LABEL)
      ? f.LIST_COLUMN_LABEL.join("/")
      : f.LIST_COLUMN_LABEL?.pt || f.LIST_COLUMN_LABEL?.br || f.LIST_COLUMN_LABEL || "";
    console.log(`  ${f.FIELD_NAME}  |  ${edit}  |  ${list}`);
  }

  if (!dealId) {
    console.log("");
    console.log("Dica: rode de novo com --deal=NUMERO_DO_CARD para inspecionar um card específico.");
    return;
  }

  console.log("");
  console.log(`== Inspecionando o card ${dealId} ==`);
  const deal = await bitrixGet("crm.deal.get", { id: String(dealId) });
  if (!deal) {
    console.log("Card não encontrado.");
    return;
  }

  console.log({
    ID: deal.ID,
    TITLE: deal.TITLE,
    CATEGORY_ID: deal.CATEGORY_ID,
    STAGE_ID: deal.STAGE_ID,
    ASSIGNED_BY_ID: deal.ASSIGNED_BY_ID,
  });

  // 1) Campo personalizado (UF_CRM_…) achado por rótulo.
  let campo = null;
  let text = "";
  let rawValue = undefined;
  if (matched?.FIELD_NAME) {
    const enumMap = buildEnumMap(matched);
    rawValue = deal[matched.FIELD_NAME];
    const t = extractFieldText(rawValue, enumMap);
    if (t) {
      campo = matched.FIELD_NAME;
      text = t;
    }
  }

  // 2) Fallback: campo PADRÃO (COMMENTS), pois é o campo Comentário renomeado.
  if (!text) {
    for (const std of RESOLUCAO_STANDARD_FIELDS) {
      const t = extractFieldText(deal[std], new Map());
      if (t) {
        campo = std;
        rawValue = deal[std];
        text = t;
        break;
      }
    }
  }

  if (campo) {
    const ok = textMatchesPainelMarker(text, markers);
    console.log("");
    console.log("-- Resultado do campo de resolução neste card --");
    console.log({
      campo,
      valor_bruto: rawValue,
      valor_resolvido: text,
      marcador_esperado: DEFAULT_PAINEL_MARKERS,
      CASA_NO_PAINEL: ok,
    });
    console.log("");
    console.log(
      ok
        ? ">> Este card DEVERIA entrar no painel."
        : ">> Este card NÃO casa com o marcador (não entraria no painel)."
    );
  } else {
    console.log("");
    console.log("Nenhum campo (personalizado ou COMMENTS) tinha valor. Campo COMMENTS bruto:");
    console.log(deal.COMMENTS);
  }
}

main().catch((err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});
