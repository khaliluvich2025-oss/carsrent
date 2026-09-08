import {
  DICTIONARIES,
  LOCALES,
  localeDir,
  LOCALE_NAMES,
  LOCALE_TAGS,
  type Locale,
  type MessageKey,
} from "./dictionaries";

export type Translator = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

/**
 * Resolve which language to render in (spec §8).
 *
 * Order: an explicit `?lang=` choice, then the agency's default. Each agency
 * enables its own subset of languages, so a request for one that is switched off
 * falls back rather than rendering a half-translated page.
 */
export function resolveLocale(
  requested: string | undefined,
  agency: { defaultLocale: Locale; enabledLocales: Locale[] },
): Locale {
  const enabled =
    agency.enabledLocales.length > 0 ? agency.enabledLocales : [...LOCALES];

  const wanted = requested?.toUpperCase() as Locale | undefined;
  if (wanted && enabled.includes(wanted)) return wanted;

  if (enabled.includes(agency.defaultLocale)) return agency.defaultLocale;
  return enabled[0];
}

/**
 * A translator bound to one locale.
 *
 * `{name}` placeholders are substituted. A missing key returns the key itself,
 * which is loud enough to notice in review but does not break the page for a
 * customer mid-booking.
 */
export function getTranslator(locale: Locale): Translator {
  const dictionary = DICTIONARIES[locale] ?? DICTIONARIES.EN;

  return (key, vars) => {
    const template = dictionary[key] ?? DICTIONARIES.EN[key] ?? key;
    if (!vars) return template;

    return Object.entries(vars).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      template,
    );
  };
}

export {
  LOCALES,
  LOCALE_NAMES,
  LOCALE_TAGS,
  localeDir,
  type Locale,
  type MessageKey,
};
