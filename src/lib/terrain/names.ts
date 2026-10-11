import yaml from 'js-yaml';
import { rng } from '../random';

/**
 * Placeholder place names. Each body gets its own "accent": a subset of
 * onsets, vowels and endings, so names on one body sound related.
 * Endings hint at geography: harbours, river crossings and high ground.
 * The sounds themselves are data: src/data/names.yaml.
 */

/** The sounds names are built from (src/data/names.yaml). */
export interface NameParts {
  onsets: string[];
  vowels: string[];
  middles: string[];
  endings: { plain: string[]; coast: string[]; river: string[]; high: string[] };
  /** Archipelago name patterns, with {name} for a generated name. */
  archipelagoPatterns: string[];
  shape: {
    accent_share: number;
    middle_chance: number;
    second_vowel_chance: number;
    site_ending_chance: { coast: number; river: number; high: number };
    length: { min: number; max: number };
    max_syllables: number;
    no_repeated_vowel_sound: boolean;
    no_doubled_vowel: boolean;
  };
}

export function parseNames(source: string): NameParts {
  const raw = yaml.load(source) as Partial<NameParts>;
  const list = (v: unknown, key: string) => {
    if (!Array.isArray(v) || !v.length) throw new Error(`names.yaml: \`${key}\` must be a non-empty list`);
    return v.map(String);
  };
  return {
    onsets: list(raw.onsets, 'onsets'),
    vowels: list(raw.vowels, 'vowels'),
    middles: list(raw.middles, 'middles'),
    endings: {
      plain: list(raw.endings?.plain, 'endings.plain'),
      coast: list(raw.endings?.coast, 'endings.coast'),
      river: list(raw.endings?.river, 'endings.river'),
      high: list(raw.endings?.high, 'endings.high'),
    },
    archipelagoPatterns: list((raw as { archipelago_patterns?: unknown }).archipelago_patterns, 'archipelago_patterns'),
    shape: (() => {
      const sh = raw.shape;
      const num = (v: unknown, key: string) => {
        if (typeof v !== 'number') throw new Error(`names.yaml: shape.${key} must be a number`);
        return v;
      };
      return {
        accent_share: num(sh?.accent_share, 'accent_share'),
        middle_chance: num(sh?.middle_chance, 'middle_chance'),
        second_vowel_chance: num(sh?.second_vowel_chance, 'second_vowel_chance'),
        site_ending_chance: {
          coast: num(sh?.site_ending_chance?.coast, 'site_ending_chance.coast'),
          river: num(sh?.site_ending_chance?.river, 'site_ending_chance.river'),
          high: num(sh?.site_ending_chance?.high, 'site_ending_chance.high'),
        },
        length: { min: num(sh?.length?.min, 'length.min'), max: num(sh?.length?.max, 'length.max') },
        max_syllables: num(sh?.max_syllables, 'max_syllables'),
        no_repeated_vowel_sound: !!sh?.no_repeated_vowel_sound,
        no_doubled_vowel: !!sh?.no_doubled_vowel,
      };
    })(),
  };
}

function pick<T>(xs: T[], r: () => number): T {
  return xs[Math.floor(r() * xs.length)];
}

export interface NameContext {
  coastal: boolean;
  river: boolean;
  high: boolean;
}

export function nameMaker(seed: number, parts: NameParts) {
  const r = rng(seed * 104729 + 7);
  // The continent's accent.
  const sh = parts.shape;
  // A share of each list, so each body's names share a flavour.
  const subset = (xs: string[]) => {
    const out = xs.filter(() => r() < sh.accent_share);
    return out.length ? out : [xs[0]];
  };
  const onsets = subset(parts.onsets);
  const vowels = subset(parts.vowels);
  const middles = subset(parts.middles);
  const plain = subset(parts.endings.plain);
  const { coast: COAST, river: RIVER, high: HIGH } = parts.endings;
  const used = new Set<string>();

  /** The style rules from names.yaml: no tongue-twisters. */
  const pleasant = (name: string) => {
    const groups: string[] = name.toLowerCase().match(/[aeiouy]+/g) ?? [];
    if (groups.length > sh.max_syllables) return false;
    if (sh.no_repeated_vowel_sound && groups.some((g, i) => g.length > 1 && groups.indexOf(g) !== i)) return false;
    if (sh.no_doubled_vowel && /([aeiouy])\1/i.test(name)) return false;
    return true;
  };

  return (ctx: NameContext): string => {
    for (let attempt = 0; attempt < 40; attempt++) {
      let stem = pick(onsets, r) + pick(vowels, r);
      if (r() < sh.middle_chance) stem += pick(middles, r) + (r() < sh.second_vowel_chance ? pick(vowels, r) : '');
      const end = sh.site_ending_chance;
      const endings = ctx.coastal && r() < end.coast ? COAST : ctx.river && r() < end.river ? RIVER : ctx.high && r() < end.high ? HIGH : plain;
      let name = stem + pick(endings, r);
      name = name.replace(/(.)\1\1/g, '$1$1');
      name = name[0].toUpperCase() + name.slice(1);
      if (name.length >= sh.length.min && name.length <= sh.length.max && !used.has(name) && pleasant(name)) {
        used.add(name);
        return name;
      }
    }
    const fallback = `Settlement ${used.size + 1}`;
    used.add(fallback);
    return fallback;
  };
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
