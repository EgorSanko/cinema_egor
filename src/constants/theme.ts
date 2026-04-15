export const COLORS = {
  bg: '#0a0a0f',
  bgCard: '#13131a',
  bgElevated: '#1a1a24',
  bgOverlay: 'rgba(0,0,0,0.85)',
  primary: '#a3e635',
  primaryDark: '#84cc16',
  primaryLight: '#bef264',
  accent: '#a78bfa',
  text: '#f1f1f4',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.12)',
  success: '#22c55e',
  warning: '#f59e0b',
  star: '#fbbf24',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const FONTS = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
};

export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  glow: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
};

export const API_BASE = 'https://sapkeflykino.ru';
export const TMDB_IMG = `${API_BASE}/tmdb-img`;
