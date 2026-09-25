import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/card";
import { FormSubmitButton } from "../FormSubmitButton";
import { AGENT_DEFAULTS, mesclarAgente, type AgentSettings } from "@/lib/ai/agent-settings";
import { dataHora } from "@/lib/ui/format";
import { resetAgent, saveAgent } from "./actions";

const CONTROL =
  "w-full rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink transition-colors " +
  "placeholder:text-ink-subtle hover:border-border-strong focus:bg-surface focus:border-primary";
const LABEL = "block text-xs font-semibold text-ink-muted";
const SECAO = "px-1 text-[10px] font-extrabold tracking-[0.09em] text-primary uppercase";

function Campo({
  nome,
  rotulo,
  dica,
  valor,
  linhas,
}: {
  nome: keyof AgentSettings;
  rotulo: string;
  dica?: string;
  valor: string;
  linhas?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={nome} className={LABEL}>
        {rotulo} {dica && <span className="font-normal text-ink-subtle">({dica})</span>}
      </label>
      {linhas ? (
        <textarea
          id={nome}
          name={nome}
          rows={linhas}
          defaultValue={valor}
          placeholder={AGENT_DEFAULTS[nome] || undefined}
          className={`py-2.5 leading-relaxed ${CONTROL}`}
        />
      ) : (
        <input
          id={nome}
          name={nome}
          defaultValue={valor}
          placeholder={AGENT_DEFAULTS[nome]}
          className={`min-h-11 ${CONTROL}`}
        />
      )}
    </div>
  );
}

export default async function AgentePage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("agent_settings").select("*").eq("id", true).maybeSingle();
  const a = mesclarAgente(data);
  const semTabela = Boolean(error);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agente de IA"
        hint="Nome, jeito de falar e frases da assistente. As regras de atendimento (quando transferir pro Gines, limite de convites, não inventar dado do imóvel) ficam fixas e não mudam aqui."
      />

      {semTabela && (
        <Card className="p-4 text-sm text-ink-muted">
          A tabela de configuração ainda não existe no banco (migração 0011). A IA está usando o comportamento padrão e
          salvar vai falhar até ela ser criada.
        </Card>
      )}

      <form action={saveAgent} className="space-y-5">
        <section className="space-y-2">
          <h2 className={SECAO}>Identidade</h2>
          <Card className="space-y-3 p-4">
            <Campo nome="assistantName" rotulo="Nome da assistente" valor={a.assistantName} />
            <Campo
              nome="identity"
              rotulo="Quem ela é e em nome de quem fala"
              dica="vem logo depois de “Você é a <nome>.”"
              valor={a.identity}
              linhas={6}
            />
            <Campo
              nome="aiDisclosure"
              rotulo="Resposta quando perguntarem se é robô"
              dica="sai exatamente assim"
              valor={a.aiDisclosure}
              linhas={2}
            />
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className={SECAO}>Tom de voz</h2>
          <Card className="space-y-3 p-4">
            <Campo
              nome="tone"
              rotulo="Personalidade e estilo"
              dica="emoji, formalidade, o que evitar — uma regra por linha"
              valor={a.tone}
              linhas={6}
            />
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className={SECAO}>Mensagens-chave</h2>
          <Card className="space-y-3 p-4">
            <Campo
              nome="greeting"
              rotulo="Primeira mensagem"
              dica="a IA pode variar um pouco, mas mantém o formato; precisa pedir o nome"
              valor={a.greeting}
              linhas={2}
            />
            <Campo
              nome="handoffMessage"
              rotulo="Ao transferir pro Gines"
              dica="sai exatamente assim"
              valor={a.handoffMessage}
              linhas={2}
            />
            <Campo
              nome="optoutMessage"
              rotulo="Despedida quando a pessoa não tem interesse"
              dica="sai exatamente assim; {nome} vira o primeiro nome"
              valor={a.optoutMessage}
              linhas={2}
            />
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className={SECAO}>Instruções extras</h2>
          <Card className="space-y-3 p-4">
            <Campo
              nome="extraInstructions"
              rotulo="Ajustes finos"
              dica="opcional — ex.: “nunca mencione prazo de obra”. Não sobrepõem as regras fixas"
              valor={a.extraInstructions}
              linhas={5}
            />
          </Card>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <FormSubmitButton pendingLabel="Salvando...">Salvar</FormSubmitButton>
          {data?.updated_at && <span className="text-xs text-ink-subtle">Última alteração: {dataHora(data.updated_at)}</span>}
        </div>
      </form>

      <form action={resetAgent}>
        <FormSubmitButton pendingLabel="Restaurando..." variant="ghost" size="sm">
          Restaurar padrão
        </FormSubmitButton>
      </form>
    </div>
  );
}
