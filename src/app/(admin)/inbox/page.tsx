import { IconInbox } from "@/components/icons";

/** Sem conversa selecionada. No celular não aparece — lá a lista ocupa a tela. */
export default function InboxPage() {
  return (
    <div className="chat-wallpaper hidden flex-1 flex-col items-center justify-center gap-3 px-6 text-center md:flex">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-primary shadow-card">
        <IconInbox className="h-6 w-6" />
      </span>
      <p className="text-base font-semibold text-ink">Selecione uma conversa</p>
      <p className="max-w-xs text-sm text-ink-muted">
        Escolha alguém na lista ao lado para ver o histórico, responder e ver a ficha do lead.
      </p>
    </div>
  );
}
