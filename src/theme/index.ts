/**
 * Theme tokens for Fuel Log.
 *
 * One dark palette, no light mode: the app is used in a car, often at night,
 * and app.json pins `userInterfaceStyle: "dark"`. Fuel amber is the single
 * accent so the eye goes straight to "range" numbers and the primary action.
 * Spacing/radius/type are small fixed scales so screens are compositions
 * rather than fresh pixel decisions.
 */

export const colors = {
  bg: '#0B0D0C',
  surface: '#151918',
  surface2: '#1E2422',
  border: '#2A312E',
  text: '#F2F5F3',
  muted: '#8A958F',
  accent: '#F5A524',
  accentSoft: 'rgba(245,165,36,0.15)',
  /** Text drawn ON the amber fill; amber is too light for white text. */
  onAccent: '#1A1203',
  danger: '#F0524F',
  dangerSoft: 'rgba(240,82,79,0.14)',
  success: '#3DDC84',
  successSoft: 'rgba(61,220,132,0.14)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/** Material's minimum touch target; every tappable thing is at least this tall. */
export const TOUCH = 48;

export const type = {
  hero: { fontSize: 64, fontWeight: '800', letterSpacing: -1.5 },
  title: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 16, fontWeight: '400' },
  bodyStrong: { fontSize: 16, fontWeight: '600' },
  small: { fontSize: 13, fontWeight: '500' },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
} as const;
