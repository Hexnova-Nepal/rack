// Ready-made themes: complete looks that recolour the whole app and bring their own font.
// Each has a dark variant and, where the original palette has one, a light variant.
// Tokens: bg (window), rail (sidebar and title bar), raise (panels and inputs), hover, line (borders),
// ink (text), soft (secondary text), faint (hints), accent, signal (warnings).
// Nord, Dracula, Gruvbox, Catppuccin and Solarized follow their open-source palettes (all MIT);
// Rack, Synthwave and Forest are Rack's own.

export const THEMES = [
  { id: 'rack', name: 'Rack', font: 'rack', note: 'Rack’s own. Pick the background shade and accent below.' },
  {
    id: 'nord', name: 'Nord', font: 'clean', credit: 'Nord by Arctic Ice Studio (MIT)',
    dark: { bg: '#2e3440', rail: '#292e39', raise: '#3b4252', hover: '#434c5e', line: '#4c566a', ink: '#eceff4', soft: '#d8dee9', faint: '#a7b1c2', accent: '#88c0d0', signal: '#d08770' },
    light: { bg: '#eceff4', rail: '#e5e9f0', raise: '#f8f9fb', hover: '#e1e6ee', line: '#c9d1dd', ink: '#2e3440', soft: '#3b4252', faint: '#596377', accent: '#5e81ac', signal: '#a54e55' },
  },
  {
    id: 'dracula', name: 'Dracula', font: 'rack', credit: 'Dracula by Zeno Rocha (MIT)',
    dark: { bg: '#282a36', rail: '#21222c', raise: '#343746', hover: '#3d4052', line: '#44475a', ink: '#f8f8f2', soft: '#d9d9e6', faint: '#a3abc9', accent: '#bd93f9', signal: '#ffb86c' },
  },
  {
    id: 'gruvbox', name: 'Gruvbox', font: 'arcade', credit: 'Gruvbox by Pavel Pertsev (MIT)',
    dark: { bg: '#282828', rail: '#1d2021', raise: '#32302f', hover: '#3c3836', line: '#504945', ink: '#ebdbb2', soft: '#d5c4a1', faint: '#a89984', accent: '#fabd2f', signal: '#fb4934' },
    light: { bg: '#fbf1c7', rail: '#f2e5bc', raise: '#f9f5d7', hover: '#f2e5bc', line: '#d5c4a1', ink: '#3c3836', soft: '#504945', faint: '#6f6359', accent: '#b57614', signal: '#9d0006' },
  },
  {
    id: 'catppuccin', name: 'Catppuccin', font: 'clean', credit: 'Catppuccin Mocha and Latte (MIT)',
    dark: { bg: '#1e1e2e', rail: '#181825', raise: '#313244', hover: '#3a3c52', line: '#45475a', ink: '#cdd6f4', soft: '#bac2de', faint: '#9399b2', accent: '#cba6f7', signal: '#fab387' },
    light: { bg: '#eff1f5', rail: '#e6e9ef', raise: '#fbfcfd', hover: '#e6e9ef', line: '#ccd0da', ink: '#4c4f69', soft: '#5c5f77', faint: '#63667c', accent: '#8839ef', signal: '#d20f39' },
  },
  {
    id: 'solarized', name: 'Solarized', font: 'classic', credit: 'Solarized by Ethan Schoonover (MIT)',
    dark: { bg: '#002b36', rail: '#00252f', raise: '#073642', hover: '#0b4251', line: '#1a4f5c', ink: '#eee8d5', soft: '#c3c7c0', faint: '#93a1a1', accent: '#268bd2', signal: '#cb4b16' },
    light: { bg: '#fdf6e3', rail: '#f5edd6', raise: '#fffcf2', hover: '#eee8d5', line: '#e0d9c3', ink: '#073642', soft: '#3d555c', faint: '#55696f', accent: '#268bd2', signal: '#b5400f' },
  },
  {
    id: 'synthwave', name: 'Synthwave', font: 'scifi',
    dark: {
      bg: '#1a1030', rail: '#150d28', raise: '#241845', hover: '#2e1f57', line: '#3a2a66', ink: '#f7efff', soft: '#d2c2f0', faint: '#a897cf', accent: '#ff4fa3', signal: '#ffd166',
      glow: 'radial-gradient(120% 70% at 50% 115%, rgba(255, 79, 163, .16), transparent 62%), radial-gradient(70% 50% at 85% -5%, rgba(54, 249, 246, .09), transparent 60%)',
    },
  },
  {
    id: 'forest', name: 'Forest', font: 'rack',
    dark: { bg: '#171f1a', rail: '#131a16', raise: '#1f2a23', hover: '#26332b', line: '#2f3f35', ink: '#e8f0e9', soft: '#b9c9bd', faint: '#8ea394', accent: '#8fd16b', signal: '#f2a65a' },
    light: { bg: '#eef2ea', rail: '#e5ebe0', raise: '#fbfdf9', hover: '#e8eee3', line: '#d0dac9', ink: '#1c2a20', soft: '#3f5245', faint: '#55685a', accent: '#2f7d46', signal: '#a34a16' },
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
