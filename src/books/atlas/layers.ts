/** Which kinds of thing the chart draws. Toggled from the Layers panel. */
export interface Layers {
  terrain: boolean;
  water: boolean;
  settlements: boolean;
  roads: boolean;
  moons: boolean;
  belts: boolean;
  anchored: boolean;
  orbital: boolean;
  shipping: boolean;
  orbits: boolean;
  bands: boolean;
  graticule: boolean;
  labels: boolean;
}

export const defaultLayers: Layers = {
  terrain: true,
  water: true,
  settlements: true,
  roads: true,
  moons: true,
  belts: true,
  anchored: true,
  orbital: true,
  shipping: true,
  orbits: true,
  bands: true,
  graticule: true,
  labels: true,
};

export const layerGroups: { title: string; items: { key: keyof Layers; label: string }[] }[] = [
  {
    title: 'Continents',
    items: [
      { key: 'terrain', label: 'Relief and contours' },
      { key: 'water', label: 'Rivers and lakes' },
      { key: 'settlements', label: 'Settlements' },
      { key: 'roads', label: 'Roads and navigable rivers' },
    ],
  },
  {
    title: 'Places',
    items: [
      { key: 'moons', label: 'Moons' },
      { key: 'belts', label: 'Belts' },
    ],
  },
  {
    title: 'Sea',
    items: [
      { key: 'shipping', label: 'Imperial shipping routes' },
      { key: 'anchored', label: 'Anchored platforms' },
      { key: 'orbital', label: 'Orbital platforms' },
    ],
  },
  {
    title: 'Chart',
    items: [
      { key: 'orbits', label: 'Orbits and lanes' },
      { key: 'bands', label: 'Imperial bands' },
      { key: 'graticule', label: 'Range rings' },
      { key: 'labels', label: 'Names' },
    ],
  },
];

const KEY = 'orbital-ocean.layers';

/** Read saved layer choices; storage can be unavailable, so fall back quietly. */
export function loadLayers(): Layers {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return { ...defaultLayers, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return defaultLayers;
  }
}

export function saveLayers(layers: Layers) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layers));
  } catch {
    // Not saved; the choice still applies for this visit.
  }
}
