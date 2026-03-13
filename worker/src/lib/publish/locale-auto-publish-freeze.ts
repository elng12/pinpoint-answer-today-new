const AUTO_LOCALE_PUBLISH_FREEZE_START = 664;
const AUTO_LOCALE_PUBLISH_FREEZE_END = 675;

export const AUTO_LOCALE_PUBLISH_FREEZE_CODE = 'LOCALE_AUTO_PUBLISH_FROZEN';
export const AUTO_LOCALE_PUBLISH_FREEZE_RANGE_LABEL =
  `#${AUTO_LOCALE_PUBLISH_FREEZE_START}-#${AUTO_LOCALE_PUBLISH_FREEZE_END}`;
export const AUTO_LOCALE_PUBLISH_FREEZE_SHORT_REASON =
  'locale auto-publish frozen for puzzles 664-675';

type LocaleAutoPublishFreezeInput = {
  puzzleNumber: number;
  locale?: string | null;
  defaultLocale?: string;
};

type LocaleAutoPublishFreezeResult = {
  active: boolean;
  code: typeof AUTO_LOCALE_PUBLISH_FREEZE_CODE;
  shortReason: string;
  details?: string;
  locale?: string;
  rangeStart: number;
  rangeEnd: number;
};

export function getLocaleAutoPublishFreeze(
  input: LocaleAutoPublishFreezeInput,
): LocaleAutoPublishFreezeResult {
  const locale = typeof input.locale === 'string' ? input.locale.trim() : '';
  const defaultLocale = (input.defaultLocale ?? 'en').trim() || 'en';
  const active =
    locale.length > 0 &&
    locale !== defaultLocale &&
    input.puzzleNumber >= AUTO_LOCALE_PUBLISH_FREEZE_START &&
    input.puzzleNumber <= AUTO_LOCALE_PUBLISH_FREEZE_END;

  if (!active) {
    return {
      active: false,
      code: AUTO_LOCALE_PUBLISH_FREEZE_CODE,
      shortReason: AUTO_LOCALE_PUBLISH_FREEZE_SHORT_REASON,
      rangeStart: AUTO_LOCALE_PUBLISH_FREEZE_START,
      rangeEnd: AUTO_LOCALE_PUBLISH_FREEZE_END,
    };
  }

  return {
    active: true,
    code: AUTO_LOCALE_PUBLISH_FREEZE_CODE,
    shortReason: AUTO_LOCALE_PUBLISH_FREEZE_SHORT_REASON,
    details:
      `Automatic locale publish is temporarily disabled for puzzle #${input.puzzleNumber} ` +
      `(${locale}) while ${AUTO_LOCALE_PUBLISH_FREEZE_RANGE_LABEL} remains under manual remediation. ` +
      'Use /api/admin/puzzles/publish for manual hotfixes.',
    locale,
    rangeStart: AUTO_LOCALE_PUBLISH_FREEZE_START,
    rangeEnd: AUTO_LOCALE_PUBLISH_FREEZE_END,
  };
}
