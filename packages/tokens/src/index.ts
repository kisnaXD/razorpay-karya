export const tokens = {
  color: {
    ink: "#0C0E12",
    surface: "#14171C",
    surface2: "#1B1F26",
    line: "#2A3038",
    text: "#E8EAED",
    muted: "#8B919C",
    copper: "#D4894A",
    teal: "#2DB89A",
    signal: "#6B8CFF",
    risk: "#E25D5D",
    warn: "#E0B44A",
  },
  font: {
    display: '"Newsreader", Georgia, serif',
    sans: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
  space: { rail: 56, agent: 360, strip: 32 },
  type: { body: 13, meta: 12, title: 15 },
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
}`;
