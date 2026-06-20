# Dashboard de Suportes Presenciais

Painel em tempo real para exibição em TV no salão — fila de atendimento presencial integrada ao **Bitrix24**, com dados sincronizados via **Supabase Realtime**.

**Produção:** [dashsuportespresenciais.vercel.app](https://dashsuportespresenciais.vercel.app)  
**Repositório:** [github.com/RafaelADSdev/Dashboard-de-Suportes-Presenciais-](https://github.com/RafaelADSdev/Dashboard-de-Suportes-Presenciais-)

---

## Visão geral

O sistema recebe eventos de deals do Bitrix24 (criação e atualização), normaliza os dados na tabela `tickets` do Supabase e exibe o painel com atualização instantânea — sem refresh manual.

Cards entram no painel quando o campo **Suporte - Resolução do chamado** contém `SUPORTE PRESENCIAL NO SALÃO` (no Bitrix do Hub, esse campo é o **Comentário** `COMMENTS` renomeado).

O solicitante é identificado pelo texto em **Nome do solicitante do Suporte**, com busca do colaborador na estrutura da empresa para derivar **equipe** e **superintendência**. Cards sem identificação aparecem na aba **S/N**.

```mermaid
flowchart LR
  B[Bitrix24 CRM] -->|ONCRMDEALADD / UPDATE| W[Edge Function<br/>bitrix-webhook]
  W -->|upsert| DB[(Supabase<br/>tickets)]
  DB -->|Realtime| P[Painel TV<br/>React + Vite]
  P -->|sync a cada 3 min| W
  P --> V[Vercel CDN]
```

---

## Funcionalidades

| Área | Descrição |
|------|-----------|
| **Suporte em andamento** | Ticket ativo com solicitante, departamento e ferramenta |
| **Último resolvido** | Foto e departamento do último atendimento concluído |
| **Próximos suportes** | Fila FIFO completa (com rolagem), solicitante, equipe, data/hora e ferramenta |
| **Resumo por status** | Contadores por estágio (nova solicitação, em atendimento, etc.) |
| **Carrossel de informações** | Slides editáveis no painel (texto ou imagem) |
| **Filtro de superintendência** | Abas **Stüpp** (S), **Nascimento** (N) e **S/N** (não identificados) |
| **Sincronização automática** | Ao abrir o painel e a cada 3 minutos via `?action=sync` |
| **Vídeo de fundo** | Background Hub On com opacidade reduzida |

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18, TypeScript, Vite |
| UI | Tailwind CSS, shadcn/ui, Lucide |
| Backend / dados | Supabase (Postgres + Realtime) |
| Integração CRM | Bitrix24 via Edge Function (Deno) |
| Deploy frontend | Vercel |
| Deploy backend | Supabase Edge Functions |

---

## Estrutura do projeto

```
├── src/
│   ├── components/
│   │   └── PainelPrincipal.tsx   # UI principal do painel TV
│   ├── integrations/supabase/    # Cliente e tipos Supabase
│   ├── lib/
│   │   ├── tickets-db.ts         # Leitura e mapeamento de tickets
│   │   ├── bitrix-sync.ts        # Disparo da sincronização em lote
│   │   ├── bitrix-filters.ts     # Filtro "SUPORTE PRESENCIAL NO SALÃO"
│   │   ├── priority-engine.ts    # Fila FIFO e posição
│   │   └── mock-data.ts          # Tipos TypeScript (Ticket, Status…)
│   ├── pages/Index.tsx
│   └── assets/                   # Logos, vídeo de fundo
├── scripts/
│   └── diagnostico-bitrix.mjs    # Diagnóstico local (sem gravar no Supabase)
├── supabase/
│   ├── functions/bitrix-webhook/ # Webhook Bitrix → Supabase
│   └── migrations/               # Alterações de schema
├── vercel.json                   # Rewrite SPA
└── .env.example                  # Variáveis do frontend
```

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) 18+ e npm
- Conta [Supabase](https://supabase.com/) com projeto configurado
- [Supabase CLI](https://supabase.com/docs/guides/cli) (para deploy da Edge Function)
- Portal Bitrix24 com permissão para configurar webhooks de saída
- Conta [Vercel](https://vercel.com/) (deploy do frontend)

---

## Configuração local

### 1. Clonar e instalar

```bash
git clone https://github.com/RafaelADSdev/Dashboard-de-Suportes-Presenciais-.git
cd Dashboard-de-Suportes-Presenciais-
npm install
```

### 2. Variáveis de ambiente (frontend)

Copie o exemplo e preencha com os dados do seu projeto Supabase:

```bash
cp .env.example .env
```

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publishable (Settings → API) |
| `VITE_SUPABASE_PROJECT_ID` | ID do projeto (referência) |
| `VITE_BITRIX_SYNC_SECRET` | Mesmo valor do secret `BITRIX_SYNC_SECRET` no Supabase (sincronização automática) |

> Sem `VITE_BITRIX_SYNC_SECRET`, o painel só atualiza via Realtime/webhook do Bitrix — não dispara sync em lote ao abrir.

### 3. Subir o frontend

```bash
npm run dev
```

Acesse `http://localhost:8080`.

---

## Supabase

### Tabela `tickets`

Campos principais usados pelo painel:

| Coluna | Origem / uso |
|--------|----------------|
| `ticket_id` | ID do deal no Bitrix |
| `solicitante` | Campo **Nome do solicitante do Suporte** (texto do card) |
| `solicitante_foto` | Foto do perfil Bitrix (usuário vinculado ou encontrado pelo nome) |
| `responsavel` | `ASSIGNED_BY_ID` |
| `departamento` | Equipe do colaborador (`department.get`) |
| `ferramenta` | Campo mapeado no webhook |
| `status` | Estágio do funil (normalizado) |
| `estagio_bitrix` | Texto do marcador do painel (ex.: `SUPORTE PRESENCIAL NO SALÃO`) |
| `superintendencia` | `Stüpp`, `Nascimento` ou `Não identificado` (aba S/N) |
| `criado_em` / `resolvido_em` | Timestamps para fila e histórico |

Aplique migrations quando necessário:

```bash
supabase db push
```

### Edge Function `bitrix-webhook`

**URL de produção:**

```
https://<PROJECT_REF>.supabase.co/functions/v1/bitrix-webhook
```

Deploy:

```bash
supabase functions deploy bitrix-webhook --no-verify-jwt
```

> A função usa `verify_jwt: false` porque o Bitrix envia `application/x-www-form-urlencoded`, não JWT do Supabase.

#### Secrets (Supabase Dashboard → Edge Functions → Secrets)

| Secret | Obrigatório | Descrição |
|--------|-------------|-----------|
| `BITRIX_INCOMING_WEBHOOK` | Sim | Webhook de entrada Bitrix (crm, user, department) |
| `BITRIX_APP_TOKEN` | Sim | Token do app Bitrix para validar requisições |
| `SUPABASE_URL` | Sim | Injetado automaticamente no deploy |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Injetado automaticamente no deploy |
| `BITRIX_SYNC_SECRET` | Recomendado | Segredo para `?action=sync` (mesmo valor de `VITE_BITRIX_SYNC_SECRET`) |
| `BITRIX_PEDRO_LEAL_USER_ID` | Não | ID do responsável alvo (ex.: `1326`) |
| `BITRIX_FILTRAR_PEDRO_LEAL` | Não | `true` filtra só deals do responsável Pedro Leal (padrão: desligado) |
| `BITRIX_RESPONSAVEL_NOME` | Não | Nome do responsável (padrão: Pedro Leal) |
| `BITRIX_CATEGORY_ID` | Não | ID do funil CRM (padrão: `54`) |
| `BITRIX_SUP_NASCIMENTO_DEPT_ID` | Não | Dept. superintendência Nascimento (padrão: `7`) |
| `BITRIX_SUP_STUBPP_DEPT_ID` | Não | Dept. superintendência Stüpp (padrão: `3`) |
| `BITRIX_PAINEL_MARKERS` | Não | Textos aceitos no campo de resolução (padrão: `SUPORTE PRESENCIAL NO SALÃO`) |
| `BITRIX_RESOLUCAO_FIELD` | Não | Override do campo de resolução (auto-detecta `COMMENTS` se vazio) |
| `BITRIX_NOME_SOLICITANTE_FIELD` | Não | Lista separada por vírgula de campos UF do nome (padrão: `UF_CRM_1781026116493`, `UF_CRM_1749565390`) |
| `BITRIX_SYNC_DAYS` | Não | Dias de histórico no sync em lote (padrão: `2`) |

---

## Configuração no Bitrix24

1. Acesse **Aplicativos → Webhooks → Webhook de saída** (ou handler de app local).
2. Registre os eventos:
   - `ONCRMDEALADD`
   - `ONCRMDEALUPDATE`
3. Aponte a URL para a Edge Function do Supabase.
4. Garanta que o webhook de **entrada** usado em `BITRIX_INCOMING_WEBHOOK` tenha escopo para:
   - `crm.deal.get`
   - `crm.deal.list`
   - `crm.deal.userfield.list`
   - `user.get` (inclui busca por `FILTER[NAME_SEARCH]`)
   - `department.get`

### Mapeamentos Bitrix relevantes

| Campo Bitrix | Uso |
|--------------|-----|
| `COMMENTS` (renomeado **Suporte - Resolução do chamado**) | Deve conter `SUPORTE PRESENCIAL NO SALÃO` para entrar no painel |
| `UF_CRM_1781026116493` | Nome do solicitante do Suporte (campo atual do funil) |
| `UF_CRM_1749565390` | Nome do solicitante (campo legado, fallback) |
| `UF_CRM_1749565388` | Suporte - Solicitante (vínculo de usuário, quando preenchido) |
| `ASSIGNED_BY_ID` | Responsável |
| `UF_DEPARTMENT` | Departamento do colaborador (estrutura da empresa) |
| Dept. ID `7` | Superintendência Nascimento |
| Dept. ID `3` | Superintendência Stüpp |

### Identificação do solicitante

1. Lê o texto do campo **Nome do solicitante do Suporte**.
2. Se o vínculo de usuário (`UF_CRM_1749565388`) estiver vazio, busca o colaborador por nome (`user.get` + `NAME_SEARCH`).
3. Sobe na árvore de departamentos para definir **equipe** e **superintendência**.
4. Se não encontrar, grava `superintendencia = Não identificado` → aparece na aba **S/N**.

Estágios do funil são convertidos para status internos (`em_atendimento`, `nova_solicitacao`, `concluido`, etc.) pela Edge Function.

---

## Deploy

### Frontend (Vercel)

O projeto está configurado como SPA Vite. Deploy automático a cada push em `main`.

1. Importe o repositório na [Vercel](https://vercel.com/new) (ou `npx vercel link`).
2. Configure as variáveis em **Settings → Environment Variables** (Production, Preview e Development):

| Variável | Obrigatória |
|----------|-------------|
| `VITE_SUPABASE_URL` | Sim |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Sim |
| `VITE_SUPABASE_PROJECT_ID` | Sim |
| `VITE_BITRIX_SYNC_SECRET` | Sim (para sync automática) |

3. Build: `npm run build` · Output: `dist`

Deploy manual via CLI:

```bash
npx vercel login
npx vercel link
npx vercel deploy --prod
```

> Variáveis `VITE_*` são embutidas no build. Após alterar env vars na Vercel, é necessário **redeploy**.

### Backend (Supabase)

A Edge Function e o banco **não** são deployados pela Vercel. Use o Supabase CLI ou o dashboard para functions e migrations.

---

## Scripts disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento (`:8080`) |
| `npm run build` | Build de produção |
| `npm run preview` | Preview do build local |
| `npm run lint` | ESLint |
| `npm test` | Testes (Vitest) |
| `npm run diag:bitrix` | Diagnóstico local de campos Bitrix (requer `BITRIX_INCOMING_WEBHOOK` no ambiente) |

---

## Fluxo de status

```
nova_solicitacao / aguardando / aguardando_solicitante / validar_ajuste
        ↓
   em_atendimento
        ↓
   concluido / finalizado
```

Tickets em status de fila entram na lista **Próximos suportes**, ordenados por `criado_em` (FIFO). O painel exibe apenas cards **criados no dia** (fuso BRT).

---

## Solução de problemas

| Sintoma | Verificação |
|---------|-------------|
| Painel vazio | Confirme as 4 variáveis `VITE_*` no `.env` ou na Vercel e refaça o build |
| Cards não aparecem após criar no Bitrix | Campo **Suporte - Resolução do chamado** com `SUPORTE PRESENCIAL NO SALÃO`; logs da Edge Function |
| Dados não atualizam | Realtime habilitado na tabela `tickets`; `VITE_BITRIX_SYNC_SECRET` configurado |
| Card na aba errada | Nome do solicitante deve casar com colaborador Bitrix; sem match → aba **S/N** |
| Card não aparece na lista | Lista é rolável — cards recentes podem estar abaixo dos mais antigos |
| Webhook não grava | Logs em Supabase → Edge Functions → `bitrix-webhook` |
| Erro de API Bitrix | Secret `BITRIX_INCOMING_WEBHOOK` com escopos corretos |
| Sync em lote falha | `WORKER_RESOURCE_LIMIT` — ajuste `BITRIX_SYNC_DAYS` (padrão: 2 dias) |

---

## Licença

Projeto privado — Hub Nogueira / uso interno.
