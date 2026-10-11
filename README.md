# The Orbital Ocean

A reference library for a worldbuilding project. The Orbital Ocean is a perfect
circle surrounded by the Endless Gunk. At its centre sits the Land of the
Large, the largest known landmass. Thirteen medium continents and two belts of
islands orbit it clockwise, most continents attended by up to three moons,
and thousands of ocean platforms dot the water between them. The belts' islands
gather in named archipelagos, some settled, some wild. Each continent
has terrain, rivers and lakes, cities, towns and villages, and roads that
follow the lie of the land.

The site opens on **the Imperial Reference Shelf**, the library as kept by the
Holy Purple Bureaucratic Empire. Only **the Atlas** is approved for reading so
far; *the Chronicle* and *the Bestiary* are pending approval.

## The Atlas

Plate I is a chart of the whole ocean on a polar projection centred on the
Land of the Large, with north at the top. The Empire's three administrative
bands are shaded and named on the chart: the Home Band inside the War Belt, the
Second Band between the belts, and the Frontier Band from the Far Belt to the
Endless Gunk.

- **Pan:** drag the map (flicks carry on with inertia), or use the arrow keys (shift for bigger steps).
- **Zoom:** scroll, pinch, double-click (shift + double-click zooms out), or use the + / − buttons. Press `0` or ◎ to see the whole ocean again.
- **Islands:** the strip along the top lists the Land of the Large and the 13 continents by band; click one to fly there. It shows full names when they fit, then short names (`short_name` in `world.yaml`, or "C. 7"), then just numbers, so it always fits. Click anything on the chart for its gazetteer entry; double-click to fly to it. *Follow* keeps the chart centred on it as time passes.
- **Gazetteer:** search for any place, island, archipelago or platform number. The index has a *Places* tab (continents by band, and each belt's archipelagos) and a *Sea* tab (shipping routes and the platform register). Entries fold their details into sections, with a breadcrumb back to the body and the index.
- **Hover:** a tooltip names whatever is under the pointer, and how far it is from the selected place.
- **Measure:** with something selected, hover another place to see the distance and bearing on the current date, or press *Measure* in its entry and click a second place to pin the measurement (`Esc` stops).
- **Back and Forward:** each place you select is a browser history entry.
- **Time:** the timeline is one slim row: play (`space`), the date (click to type one in), the slider and the speed. `[` and `]` step a day, `{` and `}` a month. ⌃ expands it to step by day, month or year and see the year scale; ⌄ folds it back. The choice is remembered.
- **Layers:** ☰ (or `L`) toggles relief, water, settlements, roads, moons, belts and archipelagos, shipping routes and ferries, anchored and orbital platforms, orbit lines, the imperial bands, range rings and names, with a key to the platform symbols. Choices are remembered in this browser.
- **Platforms:** look one up by register number in the gazetteer (just the digits work too, e.g. `1423`).
- **Sharing:** the date, the view and the selected place are kept in the URL (`#/atlas?date=1000-1-1&view=…&place=mort`), so a link opens exactly what you were looking at.

Distances are drawn to true scale. Zoomed out, each island is a fixed-size
atlas symbol with a label, like a town on a world map. As you zoom in, the
symbol fades into the island's coastline, which is generated as a placeholder
from a seed.

## Continents

Zoom into a continent to see its shaded relief and contours, then its rivers
and lakes, cities and highways, towns and roads, and finally villages and
tracks. Harbours are marked with an anchor. Navigable rivers carry a dashed
route line. Each continent's gazetteer entry lists its settlements, waters
and roads; each settlement's entry lists its road links and their lengths.

Every continent starts as a **generated placeholder**. Inner continents are
settled more densely than outer ones, and roads are routed over the terrain:
they avoid steep ground, never cross sea or lakes, bridge rivers sparingly
and merge onto existing roads. To replace a placeholder with your own drawing,
see **[docs/designing-continents.md](docs/designing-continents.md)**. In short:
download the continent's template from its gazetteer entry, draw in Inkscape
using the named layers (coast, contours, peaks, lakes, rivers, settlements,
roads), and save it as `src/data/continents/<id>.svg`.

## Belts and archipelagos

Each belt holds about a continent's worth of land, broken into islands. The
islands keep together in **archipelagos** (the Laeholm Reach, the Glaerngard
Cays…), and every island of an archipelago shares its orbital period, so the
group turns about the centre as one and neighbouring islands stay neighbours.
Archipelagos sit in lanes across the belt, each lane turning at its own speed
and spaced so that groups in different lanes pass without touching. Loose,
unnamed rocks still drift through the belts on orbits of their own.

A belt has about as many people as a continent of its land would. They live
in its settled archipelagos: the larger ones gather round a town or a city on
their biggest island, with villages on the islands about it, while small
settled ones hold just a village or two, like a moon. The rest are wild.
Islanders live by the sea, so their places are harbours, joined by **ferries**
(main ferries between towns and cities, local ones out to the villages). Each
settled archipelago trades with the wider ocean through a single chief port.

Zoomed out, a belt is a scatter of specks. Zoom in and each archipelago is
named, then its islands' coasts, places and ferries appear. Click an
archipelago for its islands, settlements, ferries and sea routes. The numbers
are in `src/parameters/belts.yaml` and `belt_density` in
`src/parameters/settlements.yaml`; names come from `src/data/names.yaml`.

## Imperial shipping

Cargo routes run between each body's **chief port** (its largest harbour),
and each settled archipelago's (the largest harbour on any of its islands).
How much two ports trade grows with the size of the places they serve and
falls with distance; the busiest routes are drawn, heavier for more traffic.
Ships must resupply: no leg may be longer than the resupply range, so routes
hop between the larger Imperial platforms (grand platforms and keeps), which
become ringed hubs. Long open-water legs cost more than short hops, crossing
a belt costs extra, and no leg crosses land.

Because everything moves, routes are re-planned for the date on the timeline
(a few times a second while playing), so the network bends and re-forms as
continents swing round. Click a route for its stops, distance and traffic.
Frontier ports can fall out of reach on some dates, when no chain of
platforms spans the gap. The rules and numbers are in
`src/parameters/shipping.yaml`.

## Ocean platforms

Platforms are generated (thousands of them) rather than listed one by one.
Their kinds and owners are named in `world.yaml`; their counts per band, sizes,
shares and spacing are in `src/parameters/platforms.yaml`. Every
platform has an Imperial register number: `HPBE-P-…` for Imperial platforms
and `HPBE-X-…` for those the Empire registers but does not own.

They come in two kinds. **Anchored** platforms are fixed in place and are
most common in the Home Band. **Orbital** platforms are most common in the
Second and Frontier Bands, and move in one of three ways: in shared lanes
about the centre, in convoy on a continent's own orbit (ahead of or behind
it), or in rings about a continent, clear of its moons.

Platforms never collide with anything. Each continent sweeps a ring of the
ocean over time, covering its orbit plus the reach of its moons. Anchored
platforms and lanes are only placed in the water between those rings, and
anything sharing a circle moves at one speed, so its spacing never changes.
`src/lib/__tests__/platforms.test.ts` checks this by simulating centuries of
dates.

To keep the chart readable, platforms are drawn by zoom. Zoomed out, they show
as a faint haze whose density shows where they cluster. Grand platforms appear
as symbols first, then keeps and stations, and beacons only up close. When a
platform is larger on screen than its symbol, it is drawn to scale. Register
numbers appear only when zoomed well in.

## How it's organised

Three kinds of thing are kept apart:

| | Where | What |
| --- | --- | --- |
| **Data** | `src/data/` | What exists and what it's called: the calendar, the roster of bodies and orbits, belts, bands, platform kinds and owners, the sounds of place names, and hand-drawn continents. |
| **Parameters** | `src/parameters/` | How much, how often and how strongly: settlement density and mix, terrain and water thresholds, road costs, platform counts and spacing, shipping range and costs, and when things appear as you zoom. See [src/parameters/README.md](src/parameters/README.md). |
| **Mechanics** | `src/lib/` | How it all works: orbits, terrain, water, settlement siting, road and shipping routing, platform placement. It reads every number from the parameters. |

Every parameter file is checked when the Atlas loads. A missing or mistyped
value stops it with a message naming the file and key.

## Editing the world

The world is defined by these files in `src/data`:

| File | Contents |
| --- | --- |
| `src/data/calendar.yaml` | Era name, months and their lengths, intercalary/festival days, weekdays, the date the atlas opens on, and the range of the timeline. |
| `src/data/continents/<id>.svg` | Optional hand-drawn continents and moons; see [docs/designing-continents.md](docs/designing-continents.md). |
| `src/data/names.yaml` | The sounds placeholder place names are built from. |
| `src/data/world.yaml` | Units (Imperial Leagues, 1 IL ≈ 1 km), the ocean's radius and edge, the Land of the Large, the continents (position 1–16, orbit radius, starting bearing, period, size, coastline seed, description) and their moons, the belts, the Empire's bands, and the kinds and owners of platforms. |

The roster and the bands follow the lore. Sizes, distances, bearings and
periods are placeholders, and positions without a name in the lore are called
"Continent N". Moons are numbered after their continent (Mort I, Mort II…). The Land of the Large is 420 IL across (about 138,000 IL²,
between Iceland and Great Britain). Brock, the outermost continent, orbits at
10,000 IL, about a quarter of Earth's circumference. The ocean ends at
10,800 IL.

## Development

```sh
npm install
npm run dev        # http://localhost:5173/orbital-ocean/
npm test           # orbits, terrain, settlements, roads, archipelagos, platforms, shipping, parameters
npm run build      # typecheck + production build into dist/
npm run test:e2e   # browser smoke tests against the build (Playwright)
```

### Deployment

`.github/workflows/pages.yml` runs the tests, the build and the browser smoke
tests on every pull request and push. Each push to `main` is then published to GitHub Pages automatically.
In the repository settings, under **Pages → Build and deployment → Source**,
choose **GitHub Actions** (one-time setup).

While `npm run dev` is running, saving `world.yaml`, `names.yaml`, a parameter
file or a continent design updates the open Atlas in place, without a reload.

Built with React, TypeScript and Vite. The chart is drawn on a 2D canvas
(`src/books/atlas/render.ts`); the UI around it is ordinary React.

```
src/
  data/            calendar.yaml, world.yaml, names.yaml (the world's content)
  data/continents/ hand-drawn continent and moon designs (SVG)
  parameters/      tuning: terrain, settlements, roads, belts, platforms, shipping, display
  lib/             calendar, orbits, world parsing, archipelagos, platforms, shipping, coastlines, camera
  lib/terrain/     elevation, water, settlements, roads, archipelago settling and ferries, design reader and template
  books/atlas/     the Atlas: map canvas, renderer, timeline, gazetteer, instruments
  Library.tsx      the Imperial Reference Shelf (home page)
  books.ts         the list of books on the shelf
```
