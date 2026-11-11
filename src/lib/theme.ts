export type ThemeId = 'classic';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  subtitle: string;
  badge: string;
  previewBg: string;
  previewCard: string;
  previewAccent: string;
  displayFont: string;
  bodyFont: string;
  vibeDescription: string;
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'classic',
    name: 'Classic Estate',
    subtitle: 'Warm Minimalist',
    badge: 'Default',
    previewBg: '#FBFBFA',
    previewCard: '#FFFFFF',
    previewAccent: '#D97706',
    displayFont: 'Inter',
    bodyFont: 'Inter',
    vibeDescription: 'Timeless estate auction aesthetic with warm neutrals & charcoal framing.'
  }
];

export const CURRENT_THEME_KEY = 'mcm_app_theme';

export function getStoredTheme(): ThemeId {
  return 'classic';
}

export function applyTheme(_themeId?: string) {
  try {
    localStorage.setItem(CURRENT_THEME_KEY, 'classic');
  } catch (e) {
    console.error('Error saving theme to localStorage', e);
  }
  document.documentElement.setAttribute('data-theme', 'classic');
}
