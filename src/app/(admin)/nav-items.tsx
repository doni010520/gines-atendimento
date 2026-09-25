import { IconBuilding, IconClock, IconInbox, IconRobot } from "@/components/icons";

/** Uma definição só das abas, usada pelo cabeçalho do desktop e pela barra do celular. */
export const NAV_ITEMS = [
  { href: "/inbox", label: "Inbox", Icon: IconInbox },
  { href: "/imoveis", label: "Imóveis", Icon: IconBuilding },
  { href: "/cadencia", label: "Configuração de follow-up", Icon: IconClock },
  { href: "/agente", label: "Agente de IA", Icon: IconRobot },
] as const;
