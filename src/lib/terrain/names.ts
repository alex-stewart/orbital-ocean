import { rng } from '../random';

/**
 * Placeholder place names. Each continent gets its own "accent": a subset of
 * onsets, vowels and endings, so names on one continent sound related.
 * Endings hint at geography: harbours, river crossings and high ground.
 */

const ONSETS = ['b', 'br', 'c', 'cr', 'd', 'dr', 'f', 'g', 'gl', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 'st', 't', 'th', 'tr', 'v', 'w', 'wr', 'y', 'z', 'ash', 'el', 'or', 'um'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ae', 'ea', 'ia', 'ou', 'y'];
const MIDDLES = ['l', 'n', 'r', 'rr', 's', 'th', 'v', 'nd', 'rn', 'st', 'lm', 'sk'];
const PLAIN = ['wick', 'ton', 'by', 'stead', 'ham', 'field', 'holm', 'mere', 'thorpe', 'ley', 'worth', 'ingas', 'dun', 'gard'];
const COAST = ['haven', 'mouth', 'hythe', 'port', 'sands', 'wharf'];
const RIVER = ['ford', 'bridge', 'brook', 'weir', 'mill'];
const HIGH = ['fell', 'crag', 'tor', 'peak', 'cairn', 'scar'];

function pick<T>(xs: T[], r: () => number): T {
  return xs[Math.floor(r() * xs.length)];
}

export interface NameContext {
  coastal: boolean;
  river: boolean;
  high: boolean;
}

export function nameMaker(seed: number) {
  const r = rng(seed * 104729 + 7);
  // The continent's accent.
  const onsets = ONSETS.filter(() => r() < 0.45);
  const vowels = VOWELS.filter(() => r() < 0.6);
  const middles = MIDDLES.filter(() => r() < 0.5);
  const plain = PLAIN.filter(() => r() < 0.5);
  if (!onsets.length) onsets.push('b');
  if (!vowels.length) vowels.push('a');
  if (!middles.length) middles.push('r');
  if (!plain.length) plain.push('ton');
  const used = new Set<string>();

  return (ctx: NameContext): string => {
    for (let attempt = 0; attempt < 40; attempt++) {
      let stem = pick(onsets, r) + pick(vowels, r);
      if (r() < 0.55) stem += pick(middles, r) + (r() < 0.4 ? pick(vowels, r) : '');
      const endings = ctx.coastal && r() < 0.6 ? COAST : ctx.river && r() < 0.5 ? RIVER : ctx.high && r() < 0.5 ? HIGH : plain;
      let name = stem + pick(endings, r);
      name = name.replace(/(.)\1\1/g, '$1$1');
      name = name[0].toUpperCase() + name.slice(1);
      if (name.length >= 4 && name.length <= 13 && !used.has(name)) {
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
