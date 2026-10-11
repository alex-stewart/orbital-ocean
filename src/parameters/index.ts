import { parseParameters } from './schema';

export type * from './schema';

const files = import.meta.glob('./*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Every tuning parameter, read from src/parameters/*.yaml and checked. */
export const parameters = parseParameters(
  Object.fromEntries(Object.entries(files).map(([path, text]) => [path.replace(/^.*\/(.+)\.yaml$/, '$1'), text])),
);
