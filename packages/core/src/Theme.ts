import { WidgetTheme } from "./types";

export const defaultTheme: WidgetTheme = {
  primary: "#4F46E5",
  secondary: "#818CF8",
  background: "#FFFFFF",
  surface: "#F9FAFB",
  textPrimary: "#111827",
  textSecondary: "#6B7280",
  border: "#E5E7EB",
  danger: "#DC2626",
  success: "#16A34A",
  radius: "md",
  mode: "light",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

export const darkTheme: WidgetTheme = {
  ...defaultTheme,
  background: "#111827",
  surface: "#1F2937",
  textPrimary: "#F9FAFB",
  textSecondary: "#9CA3AF",
  border: "#374151",
  mode: "dark",
};

const RADIUS_MAP: Record<WidgetTheme["radius"], string> = {
  none: "0px",
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  full: "9999px",
};

/**
 * Merges a partial theme override on top of the appropriate base theme
 * and returns a full WidgetTheme.
 */
export function resolveTheme(overrides?: Partial<WidgetTheme>): WidgetTheme {
  const base = overrides?.mode === "dark" ? darkTheme : defaultTheme;
  return { ...base, ...overrides };
}

/**
 * Converts a WidgetTheme into a CSS custom-property map (e.g. for
 * setting on a root element's `style` attribute), so every framework
 * wrapper and the web component render identically.
 */
export function themeToCssVars(theme: WidgetTheme): Record<string, string> {
  return {
    "--eaw-color-primary": theme.primary,
    "--eaw-color-secondary": theme.secondary ?? defaultTheme.secondary!,
    "--eaw-color-bg": theme.background ?? defaultTheme.background!,
    "--eaw-color-surface": theme.surface ?? defaultTheme.surface!,
    "--eaw-color-text-primary": theme.textPrimary ?? defaultTheme.textPrimary!,
    "--eaw-color-text-secondary":
      theme.textSecondary ?? defaultTheme.textSecondary!,
    "--eaw-color-border": theme.border ?? defaultTheme.border!,
    "--eaw-color-danger": theme.danger ?? defaultTheme.danger!,
    "--eaw-color-success": theme.success ?? defaultTheme.success!,
    "--eaw-radius": RADIUS_MAP[theme.radius],
    "--eaw-font-family": theme.fontFamily ?? defaultTheme.fontFamily!,
  };
}
