export type AutoI18nTriggerKind = 'manual' | 'scheduled';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export function parseAutoI18nOverride(raw: string | null | undefined): boolean | undefined {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return undefined;
}

export function resolveAutoI18nEnabled(
  triggerKind: AutoI18nTriggerKind,
  rawOverride: string | null | undefined,
): boolean {
  const override = parseAutoI18nOverride(rawOverride);
  if (override != null) return override;
  return triggerKind === 'manual';
}
