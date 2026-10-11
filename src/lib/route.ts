import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  params: URLSearchParams;
}

function parse(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = hash.split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

/** Minimal hash router — hash URLs work on GitHub Pages without rewrites. */
export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** Update the query string of the current route without adding history. */
export function replaceParams(params: Record<string, string | null>) {
  const { path, params: current } = parse();
  for (const [k, v] of Object.entries(params)) {
    if (v === null) current.delete(k);
    else current.set(k, v);
  }
  const q = current.toString();
  history.replaceState(null, '', `#${path}${q ? `?${q}` : ''}`);
}

/** Like replaceParams, but as a new history entry (so Back returns to the previous one). */
export function pushParams(params: Record<string, string | null>) {
  const { path, params: current } = parse();
  for (const [k, v] of Object.entries(params)) {
    if (v === null) current.delete(k);
    else current.set(k, v);
  }
  const q = current.toString();
  history.pushState(null, '', `#${path}${q ? `?${q}` : ''}`);
}

/** The current hash route's parameters (outside React). */
export function currentParams(): URLSearchParams {
  return parse().params;
}
