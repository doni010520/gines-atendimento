"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendText } from "@/lib/whatsapp/uazapi";

export async function assumeConversation(conversationId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("conversations")
    .update({ status: "open", ai_enabled: false, assigned_user_id: user.id, next_followup_at: null })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversationId}`);
}

/** Devolve a conversa pro robô — religa a IA e o follow-up (comando explícito do corretor). */
export async function returnToBot(conversationId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("conversations")
    .update({ status: "bot", ai_enabled: true, assigned_user_id: null })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversationId}`);
}

export async function sendManualMessage(conversationId: string, text: string) {
  if (!text.trim()) return;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: conversation } = await supabase
    .from("conversations")
    .select("contact_id")
    .eq("id", conversationId)
    .single();
  if (!conversation) throw new Error("conversa não encontrada");

  const { data: contact } = await supabase.from("contacts").select("phone").eq("id", conversation.contact_id).single();
  if (!contact) throw new Error("contato não encontrado");

  await sendText(contact.phone, text);

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    direction: "out",
    body: text,
  });

  revalidatePath(`/inbox/${conversationId}`);
}

/** Wrapper compatível com `<form action={...bind(null, id)}>`. */
export async function sendMessageFormAction(conversationId: string, formData: FormData) {
  const text = String(formData.get("text") ?? "");
  await sendManualMessage(conversationId, text);
}
