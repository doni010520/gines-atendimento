/**
 * Ícones em SVG inline. Substituem os emoji (💬 🏡 🗑) que a barra de abas e os
 * botões usavam — emoji renderiza diferente em cada sistema e não herda cor.
 *
 * Todos herdam `currentColor` e o traço tem a mesma gramática (1.75, ponta
 * arredondada), pra que não pareçam vindos de bibliotecas diferentes.
 */

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconInbox({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 12h4l2 3h6l2-3h4" />
      <path d="M5.5 5h13l2.5 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2.5-7Z" />
    </svg>
  );
}

export function IconBuilding({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-5h6v5" />
      <path d="M9.5 9.5h.01M14.5 9.5h.01M9.5 12.5h.01M14.5 12.5h.01" />
    </svg>
  );
}

export function IconSend({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 12 20 4l-4 16-4.5-6.5L4.5 12Z" />
      <path d="m11.5 13.5 8.5-9.5" />
    </svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconBack({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconHandRaised({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 10.5V6.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M8 11V9.5a1.5 1.5 0 0 0-3 0V14a7 7 0 0 0 7 7h1a6 6 0 0 0 6-6v-4" />
    </svg>
  );
}

export function IconRobot({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4.5M9 14h.01M15 14h.01M9.5 17.5h5" />
    </svg>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconClip({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />
    </svg>
  );
}
