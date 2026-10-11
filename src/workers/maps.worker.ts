/// <reference lib="webworker" />
import { world } from '../data';
import { buildContinentMap } from '../lib/terrain';

/**
 * Builds continent maps off the main thread. The worker loads the same data
 * and parameters as the page, so its maps are identical to ones the page
 * would build itself; it sends each back as soon as it's done.
 *
 * In:  { order: string[] }  body ids, most wanted first
 * Out: { id, map }          one message per body
 */
self.onmessage = (e: MessageEvent<{ order: string[] }>) => {
  for (const id of e.data.order) {
    const body = world.bodies.find((b) => b.id === id);
    if (!body) continue;
    const map = buildContinentMap(world, body);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, map }, [map.elevation.buffer, map.land.buffer, map.lake.buffer]);
  }
};
