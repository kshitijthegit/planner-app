// Background that follows the time of day: light mint at 06:00, darkening hour by hour to phthalo deep by 05:00.
// Text and surface colours are derived so everything stays readable on light and dark shades.

type RGB = [number, number, number];

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: RGB) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: string, b: string, t: number) => {
  const A = hex(a);
  const B = hex(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
};
function luminance(h: string): number {
  const [r, g, b] = hex(h).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Background per step; step 0 = 06:00 … step 23 = 05:00. Light mint ink → mint ink → phthalo → phthalo deep. */
const STOPS: [number, string][] = [
  [0, '#D6F0E4'], // 06:00 light mint ink
  [5, '#AEDFC8'], // 11:00
  [9, '#7CC9A8'], // 15:00
  [11, '#4FB38E'], // 17:00 mint ink
  [13, '#2E7D61'], // 19:00
  [15, '#1E5A45'], // 21:00 phthalo light
  [18, '#133B2D'], // 00:00 phthalo
  [23, '#0C2A20'], // 05:00 phthalo deep
];

export function backgroundForHour(hour: number): string {
  const step = (hour - 6 + 24) % 24;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [s0, c0] = STOPS[i];
    const [s1, c1] = STOPS[i + 1];
    if (step >= s0 && step <= s1) return mix(c0, c1, (step - s0) / (s1 - s0));
  }
  return STOPS[STOPS.length - 1][1];
}

export function isLightBg(bg: string): boolean {
  return luminance(bg) > 0.22;
}

export function themeVars(bg: string): Record<string, string> {
  const light = isLightBg(bg);
  const text = light ? '#0E2A1F' : '#EADBC4';
  return {
    '--bg': bg,
    '--rail': mix(bg, light ? '#0C2A20' : '#000000', light ? 0.08 : 0.2),
    '--surface': light ? mix(bg, '#FFFFFF', 0.55) : mix(bg, '#3F8A6C', 0.18),
    '--surface-2': light ? mix(bg, '#FFFFFF', 0.35) : mix(bg, '#3F8A6C', 0.26),
    '--selected': light ? mix(bg, '#1E5A45', 0.28) : mix(bg, '#4FB38E', 0.32),
    '--border': mix(bg, text, light ? 0.16 : 0.12),
    '--border-2': mix(bg, text, light ? 0.26 : 0.2),
    '--text': text,
    '--muted': light ? '#2F5546' : '#A9BFB3',
    '--now': light ? '#0F5A41' : '#4FB38E',
    '--warn': light ? '#A4471F' : '#E8956A',
    '--danger': light ? '#A33A2C' : '#E88A7A',
    '--accent-soft': light ? '#6F4E3726' : '#C89F7226',
    'color-scheme': light ? 'light' : 'dark',
  };
}

export const NIGHT_BG = '#0C2A20';
