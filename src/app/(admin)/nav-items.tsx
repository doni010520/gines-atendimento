import { IconBuilding, IconInbox } from "@/components/icons";

/** Uma definição só das abas, usada pelo cabeçalho do desktop e pela barra do celular. */
export const NAV_ITEMS = [
  { href: "/inbox", label: "Inbox", Icon: IconInbox },
  { href: "/imoveis", label: "Imóveis", Icon: IconBuilding },
] as const;
