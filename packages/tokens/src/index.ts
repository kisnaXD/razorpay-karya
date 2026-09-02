export const tokens = {
  color: {
    ink: "#09090B", // zinc-950 (slightly warmer base)
    surface: "#18181B", // zinc-900 (elevation step 1)
    surface2: "#27272A", // zinc-800 (elevated cards/panels)
    line: "#27272A", // zinc-800 (subtle borders)
    text: "#FAFAFA", // zinc-50 (crisp primary text)
    muted: "#A1A1AA", // zinc-400 (better contrast ratio)
    copper: "#F59E0B", // amber-500 (warmer, higher contrast)
    teal: "#2DD4BF", // teal-400
    signal: "#3B82F6", // blue-500 (pro accent, less aggressive)
    risk: "#EF4444", // red-500
    warn: "#F59E0B", // amber-500
  },
  font: {
    display: '"Newsreader", Georgia, serif',
    sans: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
  space: { rail: 56, agent: 360, strip: 32 },
  type: { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 20 },
  radius: { sm: 4, md: 6, lg: 12 },
  duration: { fast: 100, normal: 200 },
} as const;

export const tokenCss = `:root {
  --ink: ${tokens.color.ink};
  --surface: ${tokens.color.surface};
  --surface-2: ${tokens.color.surface2};
  --line: ${tokens.color.line};
  --text: ${tokens.color.text};
  --muted: ${tokens.color.muted};
  --copper: ${tokens.color.copper};
  --teal: ${tokens.color.teal};
  --signal: ${tokens.color.signal};
  --risk: ${tokens.color.risk};
  --warn: ${tokens.color.warn};
  --font-display: ${tokens.font.display};
  --font-sans: ${tokens.font.sans};
  --font-mono: ${tokens.font.mono};
  --space-rail: ${tokens.space.rail}px;
  --space-agent: ${tokens.space.agent}px;
  --space-strip: ${tokens.space.strip}px;
  --type-xs: ${tokens.type.xs}px;
  --type-sm: ${tokens.type.sm}px;
  --type-base: ${tokens.type.base}px;
  --type-md: ${tokens.type.md}px;
  --type-lg: ${tokens.type.lg}px;
  --type-xl: ${tokens.type.xl}px;
  --radius-sm: ${tokens.radius.sm}px;
  --radius-md: ${tokens.radius.md}px;
  --radius-lg: ${tokens.radius.lg}px;
  --duration-fast: ${tokens.duration.fast}ms;
  --duration-normal: ${tokens.duration.normal}ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}`;
