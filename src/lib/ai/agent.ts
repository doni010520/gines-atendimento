import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import { createServiceClient } from "@/lib/supabase/service";
import { buildSystemPrompt } from "./prompt";
import { TOOLS } from "./tools";
import { executeTool, type ToolContext } from "./tools-exec";
import { sendText } from "@/lib/whatsapp/uazapi";
import { logEvent } from "@/lib/log";

const MAX_ITERATIONS = 6;
const LOCK_MS = 2 * 60 * 1000;
const HISTORY_LIMIT = 30;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

// bot diz que vai fazer algo sem ter chamado a tool correspondente nesse turno.
// Achado em teste real (13/08/26): "já vou registrar" (nome) não era coberto — o modelo
// pode usar qualquer verbo de ação, não só verificar/confirmar. Lista ampliada de propósito.
const PROMISE_VERBS =
  "verificar|confirmar|checar|ver|registrar|anotar|guardar|salvar|marcar|passar|chamar|transferir|avisar|encaminhar|agendar|procurar|buscar|consultar";
const PROMISE_RE = new RegExp(
  `\\b(já? ?vou (${PROMISE_VERBS})|já te (passo|chamo|confirmo|encaminho|transfiro)|deixa eu (${PROMISE_VERBS}))\\b`,
  "i"
);

function openaiClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");
  return new OpenAI({ apiKey });
}

async function acquireLock(db: ReturnType<typeof createServiceClient>, conversationId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + LOCK_MS).toISOString();

  const { data } = await db
    .from("conversations")
    .select("bot_lock_until")
    .eq("id", conversationId)
    .single();

  if (data?.bot_lock_until && data.bot_lock_until > nowIso) return false;

  const { error } = await db.from("conversations").update({ bot_lock_until: untilIso }).eq("id", conversationId);
  return !error;
}

async function releaseLock(db: ReturnType<typeof createServiceClient>, conversationId: string) {
  await db.from("conversations").update({ bot_lock_until: null }).eq("id", conversationId);
}

async function callOpenAiWithRetry(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  attempt = 1
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  try {
    return await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS,
      temperature: 0.4,
    });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const transient = status === 429 || (status !== undefined && status >= 500);
    if (transient && attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 1500));
      return callOpenAiWithRetry(client, messages, attempt + 1);
    }
    throw err;
  }
}

function splitForWhatsapp(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export async function runAgentTurn(conversationId: string) {
  const db = createServiceClient();

  const { data: conversation } = await db.from("conversations").select("*").eq("id", conversationId).single();
  if (!conversation) return;
  if (!conversation.ai_enabled) return;

  const locked = await acquireLock(db, conversationId);
  if (!locked) return; // já tem um turno rodando pra essa conversa

  try {
    const { data: contact } = await db.from("contacts").select("*").eq("id", conversation.contact_id).single();
    if (!contact) return;

    const { data: focusedProperty } = conversation.property_id
      ? await db.from("properties").select("*").eq("id", conversation.property_id).maybeSingle()
      : { data: null };

    const { data: otherProperties } = await db
      .from("properties")
      .select("id,title,neighborhood,price")
      .eq("status", "ativo")
      .neq("id", conversation.property_id ?? "00000000-0000-0000-0000-000000000000")
      .limit(5);

    const { data: history } = await db
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    const systemPrompt = buildSystemPrompt({
      contactName: contact.name,
      nameConfirmed: contact.name_confirmed,
      focusedProperty: focusedProperty ?? null,
      otherActiveProperties: otherProperties ?? [],
      nowIso: new Date().toISOString(),
    });

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...((history ?? [])
        .reverse()
        .filter((m) => !m.is_internal)
        .map((m): ChatCompletionMessageParam => ({
          role: m.direction === "in" ? "user" : "assistant",
          content: m.body ?? "",
        }))),
    ];

    const client = openaiClient();
    const toolCtx: ToolContext = {
      db,
      conversationId,
      phone: contact.phone,
      contactId: contact.id,
      propertyId: conversation.property_id,
      materialSentAt: conversation.material_sent_at,
    };

    let toolWasCalled = false;
    let finalText = "";

    for (let step = 0; step < MAX_ITERATIONS; step++) {
      const completion = await callOpenAiWithRetry(client, messages);
      const choice = completion.choices[0];
      const msg = choice.message;

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        toolWasCalled = true;
        messages.push(msg);
        for (const toolCall of msg.tool_calls) {
          const result = await runTool(toolCall, toolCtx);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
          if (toolCall.type !== "function") continue;
          // property_id pode ter mudado (focar_imovel) — mantém o contexto local coerente
          if (toolCall.function.name === "focar_imovel") {
            const { data: refreshed } = await db
              .from("conversations")
              .select("property_id")
              .eq("id", conversationId)
              .single();
            toolCtx.propertyId = refreshed?.property_id ?? toolCtx.propertyId;
          }
          if (toolCall.function.name === "enviar_material") {
            toolCtx.materialSentAt = toolCtx.materialSentAt ?? new Date().toISOString();
          }
        }
        continue;
      }

      finalText = msg.content ?? "";
      break;
    }

    if (finalText && PROMISE_RE.test(finalText) && !toolWasCalled) {
      await logEvent("warn", "agent", "promessa vazia detectada — nenhuma tool foi chamada", {
        conversationId,
        finalText,
      });
      messages.push({ role: "assistant", content: finalText });
      messages.push({
        role: "user",
        content:
          "[sistema] Você disse que ia verificar/confirmar algo mas não chamou nenhuma ferramenta. Ou chame a ferramenta certa agora, ou responda só com o que você já sabe pelo contexto — nunca prometa uma ação sem executá-la.",
      });
      const retryCompletion = await callOpenAiWithRetry(client, messages);
      finalText = retryCompletion.choices[0].message.content ?? finalText;
    }

    if (finalText) {
      const parts = splitForWhatsapp(finalText);
      for (const part of parts) {
        await sendText(contact.phone, part).catch((err) =>
          logEvent("error", "agent", "falha ao enviar texto", {
            conversationId,
            error: err instanceof Error ? err.message : String(err),
          })
        );
        await db.from("messages").insert({ conversation_id: conversationId, direction: "out", body: part });
      }
    }
  } catch (err) {
    await logEvent("error", "agent", "falha no turno do agente", {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    // falha nunca aparece pro cliente como erro técnico — melhor deixar sem resposta
    // nesse turno do que mandar mensagem quebrada; o follow-up/cliente insistindo cobre o resto.
  } finally {
    await releaseLock(db, conversationId);
  }
}

async function runTool(toolCall: ChatCompletionMessageToolCall, ctx: ToolContext) {
  if (toolCall.type !== "function") return { ok: false, error: "tipo de tool não suportado" };
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.function.arguments || "{}");
  } catch {
    return { ok: false, error: "argumentos inválidos" };
  }
  try {
    return await executeTool(toolCall.function.name, args, ctx);
  } catch (err) {
    await logEvent("error", "tool", `falha ao executar ${toolCall.function.name}`, {
      conversationId: ctx.conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "falha interna na ferramenta" };
  }
}
