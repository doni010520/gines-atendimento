import OpenAI from "openai";

/** Mesmo modelo do agente em todo lugar que gera texto pro cliente. */
export const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export function openaiClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");
  return new OpenAI({ apiKey });
}
