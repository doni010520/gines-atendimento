# GINES Atendimento

Agente de IA para WhatsApp (imobiliária GINES) + painel de cadastro de imóveis e inbox da equipe.

## O que já está pronto

- Banco Supabase **provisionado e com o schema aplicado** (projeto `gines-atendimento`, região `sa-east-1`).
- Storage bucket `property-media` criado (upload de vídeo/PDF/fotos por imóvel).
- Painel admin: login, cadastro/edição de imóvel com upload, inbox com fila de handoff.
- Núcleo do agente: prompt em camadas, 6 tools (function calling), motor de follow-up (cadência de 6 toques em 24h/48h/96h/120h/168h/216h a partir da última mensagem do robô, e encerra), detecção de "promessa vazia", lock/dedup/debounce de mensagens.
- Webhook único da uazapi + endpoints de debug (protegidos, só funcionam com `DEBUG=true`).

## O que falta você me dar pra ele "ficar no ar" de verdade

| Precisa de | Onde conseguir | Onde colocar |
|---|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API Keys | `.env.local` / variável de ambiente do deploy |
| Instância uazapi conectada ao número do GINES (QR code) | seu provedor de uazapi — mesmo processo que você já fez pro Corrêa/MVF | `UAZAPI_BASE_URL` e `UAZAPI_TOKEN` |
| ID do grupo/número da equipe pra onde o bot avisa handoff ("passar o bastão") | pegue o `chatid` do grupo (mesma lógica do Corrêa) | `NOTIFY_GROUP_ID` |
| Configurar o webhook da instância uazapi apontando pra `https://SEU-DOMINIO/api/webhooks/uazapi?token=<WEBHOOK_TOKEN>` | painel/API da uazapi | — |
| ~~Cron externo~~ — **não é mais necessário**: o próprio servidor agenda a régua a cada 5 min (`src/instrumentation.ts`). `/api/cron` continua valendo pra disparo manual. Pra desligar o agendador: `FOLLOWUP_SCHEDULER=off` | — | pronto |
| Onde hospedar (Docker/EasyPanel como os outros projetos, ou outra opção sua) | — | — |
| Domínio | — | — |

`WEBHOOK_TOKEN`, `CRON_SECRET` e `DEBUG_TOKEN` **já foram gerados** e estão no `.env.local` — não precisa criar, só usar.

### Primeiro usuário do painel (você)

```bash
node --env-file=.env.local scripts/create-user.mjs seu-email@exemplo.com "sua-senha" "Seu Nome" admin
```

Pra cada corretor da equipe, repita trocando `admin` por `corretor`.

## ⚠️ Risco técnico a validar antes de confiar 100% no fluxo

A identificação automática do imóvel pelo anúncio clicado (`referral`/`externalAdReplyInfo` do WhatsApp) **não está confirmada em produção** — nenhum dos seus outros bots usa esse campo, então não sabemos ainda se a uazapi repassa esse dado.

Como testar: depois que a instância estiver conectada e o webhook configurado, clique num anúncio real (Click to WhatsApp) e mande uma mensagem. Depois confira:

```
GET /api/debug?token=<DEBUG_TOKEN>&action=ad-referrals
```

(com `DEBUG=true` setado). Se vier algo em `raw` com título/thumbnail do anúncio, o matching por título funciona. Se não vier nada reconhecível, o bot já cai no plano B automaticamente (pergunta qual imóvel interessou, listando os ativos) — só não vai ser automático.

## Rodando localmente

```bash
npm install
npm run dev
```

Sem `OPENAI_API_KEY`/`UAZAPI_*` configurados, o painel (login, cadastro de imóvel, inbox) funciona normalmente — só a conversa de fato com o WhatsApp depende dessas chaves.

## Deploy

Dockerfile já pronto (multi-stage, `output: "standalone"`). Mesmo padrão dos seus outros apps: build → registry (GHCR) → EasyPanel.

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
  -t gines-atendimento .
```

As demais variáveis (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `UAZAPI_*`, `WEBHOOK_TOKEN`, `CRON_SECRET`, `DEBUG_TOKEN`, `NOTIFY_GROUP_ID`) são só runtime — configura direto no serviço do EasyPanel, não precisa rebuildar a imagem quando trocar.

## Arquitetura (resumo)

- **Next.js 16** (App Router) + TypeScript + Tailwind — painel e API num serviço só.
- **Supabase** (Postgres + Auth + Storage) — `properties`, `contacts`, `conversations`, `messages`, `ad_referrals`, `app_logs`.
- **uazapi** — canal WhatsApp, webhook único (`/api/webhooks/uazapi`).
- **OpenAI** (`gpt-4.1-mini` por padrão, configurável via `OPENAI_MODEL`) — function calling, 6 tools: `buscar_imovel`, `focar_imovel`, `enviar_material`, `registrar_nome`, `transferir_para_humano`, `finalizar_atendimento`.
### Testar a cadência em minutos (em vez de 9 dias)

Com `DEBUG=true` **e** `FOLLOWUP_TEST_GAP_MIN=2` no ambiente, a cadência ignora a janela de horário e o toque N sai N×2 minutos depois da última mensagem do robô. Batendo em `/api/cron?secret=...` a cada minuto, os 6 toques rodam em ~12 minutos pelo caminho real do cron. `GET /api/debug?action=regua-preview&conversationId=...` mostra a agenda e os textos que a IA geraria (sem enviar); `POST /api/debug?action=regua-disparar&confirmar=1` dispara o toque atual na hora.

As duas variáveis são exigidas juntas de propósito: em produção `DEBUG=false`, então a variável de teste esquecida no ambiente não faz nada. O valor é limitado a 1–60 minutos e cada rodada em modo de teste grava um `warn` em `app_logs`. A resposta do `/api/cron` traz `modo_teste` quando está ligado.

Outros dois atalhos de teste (também atrás de `DEBUG=true` + `DEBUG_TOKEN`):

- `GET /api/debug?action=regua-preview&propertyId=...&nome=...` — mostra as 3 mensagens com o dado real do imóvel e quando cada uma sairia. Não envia nada.
- `POST /api/debug?action=regua-disparar&confirmar=1` com `{ "conversationId": "..." }` — dispara o estágio atual na hora. **Manda WhatsApp de verdade**; recusa conversa com opt-out ou que já esteja com um humano.

- **Motor de follow-up** — agendador interno (`src/instrumentation.ts`) chama o motor a cada 5 min. O relógio começa na última mensagem do robô sem resposta do lead; toques em **24h (texto+mídia) → 48h → 96h (texto+mídia) → 120h → 168h → 216h (ultimato+mídia)**, contados da âncora. Textos gerados pela IA a partir do histórico (com modelo fixo de reserva); mídias globais configuradas em `/cadencia`. Resposta do lead pausa; nova fala do robô recomeça do toque 1. Após o 6º toque a conversa ganha a tag "Perdido por Falta de Retorno". Janela 09h30–19h30 (domingo bloqueado). Resposta negativa dispara a despedida e trava a cadência (`opt_out`).
- **Handoff** — `transferir_para_humano` põe a conversa em `queued` e avisa o grupo da equipe; a IA continua respondendo até um corretor clicar "Assumir" no painel — só aí ela desliga pra aquela conversa.

## Fora do escopo desta v1 (decisão deliberada, pra manter direto)

- Sem busca semântica/RAG — poucos imóveis, busca estruturada resolve.
- Sem automação de fechadura/senha da visita autoguiada — corretor manda a senha manualmente.
- Sem pipeline de negociação/ROI (isso é específico de leilão, não se aplica aqui).
- Sem UI de pareamento de número (QR code) — parear a instância uazapi direto no provedor dela.
