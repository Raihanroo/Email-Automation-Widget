export const cn = (
  ...classes: (string | undefined | false | null)[]
): string => {
  return classes.filter(Boolean).join(" ");
};

export const formatDate = (date: Date | string, locale = "en-US"): string => {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (value: string): boolean =>
  EMAIL_RE.test(value.trim());

export const truncate = (text: string, maxLength: number): string =>
  text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;

export const generateId = (): string =>
  `eaw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs = 300
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Partial<T>
): T {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const overrideVal = override[key];
    const baseVal = base[key];
    if (
      overrideVal &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>
      );
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal;
    }
  }
  return result as T;
}

export function renderPlaceholders(
  template: string,
  placeholders: Record<string, string> = {}
): string {
  return template.replace(/{{\s*(\w+)\s*}}|{\s*(\w+)\s*}/g, (_match, a, b) => {
    const key = a ?? b;
    return placeholders[key] ?? "";
  });
}
