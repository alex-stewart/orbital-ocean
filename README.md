# The Orbital Ocean

A reference library for a worldbuilding project. The Orbital Ocean is a perfect
circle surrounded by the Endless Gunk. At its centre sits the Land of the
Large, the largest known landmass. Thirteen medium continents and two belts of
islands orbit it clockwise, most continents attended by up to three moons,
and a few hundred ocean platforms keep the sea lanes between them. The belts' islands
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
- **Platforms:** look one up by register number in the gazetteer (just the digits work too, e.g. `12`).
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

There are about 240 platforms: the Empire's **grand platforms** (the size of a
large cathedral) and **keeps** (a castle keep), and a few keeps held by
independents or left derelict. Each is listed in `src/data/platforms.yaml`
with its Imperial register number: `HPBE-P-…` for Imperial platforms and
`HPBE-X-…` for those the Empire registers but does not own.

They were **sited by trade**, by `npm run seed -- platforms`, and can be
re-sited the same way (or from the editor) after you move continents about:

- Trade between every pair of chief ports is sampled on 90 dates over 60
  years, and each voyage's value is spread along its line.
- Most anchored platforms form a **backbone**: rings of keeps round the open
  water between the orbits, a little under resupply range apart, given out
  to the water that trade crosses most. Ships can always work their way round.
- The rest go where valuable traffic passes most often. Lanes open about the
  centre at the radii most traffic crosses. Convoys ride ahead of and behind
  the continents that trade most, and rings orbit them.
- The busiest spots get the grand platforms.
- Finally, routes still out of range on some dates get extra keeps.

Over the years the continents come round every way, so siting mostly finds
*how far out* trade crosses, rather than in which direction. Lower
`siting.years` in `src/parameters/platforms.yaml` to site for the routes of
the present era instead. With the seeded platforms, nearly every Imperial
platform is called at by some route over the years, and about nine in ten
wanted routes are within resupply range on any date. The rest are mostly
frontier routes, which lore says can fall out of reach. Counts and siting are
tuned in `src/parameters/platforms.yaml`.

**Anchored** platforms are fixed in place. **Orbital** ones move in one of three
ways: in shared lanes about the centre, in convoy on a continent's own orbit
(ahead of or behind it), or in rings about a continent, clear of its moons.
None of them can collide with anything. Each continent sweeps a ring of the
ocean over time, covering its orbit plus the reach of its moons. Anchored
platforms and lanes keep to the water between those rings, and anything
sharing a circle moves at one speed. If an edit breaks these rules, the Atlas
names the platform and what it is in the path of.

## How it's organised

Three kinds of thing are kept apart:

| | Where | What |
| --- | --- | --- |
| **Data** | `src/data/` | What exists, where, and what it's called: the calendar, the bodies and orbits, belts, bands, the archipelagos, every settlement and platform, the sounds of place names, and hand-drawn continents. Seeded once by the generators, then yours to edit. |
| **Parameters** | `src/parameters/` | How much, how often and how strongly: settlement density and mix, terrain and water thresholds, road costs, platform counts and spacing, shipping range and costs, and when things appear as you zoom. See [src/parameters/README.md](src/parameters/README.md). |
| **Mechanics** | `src/lib/` | How it all works: orbits, terrain and water, road and shipping routing, and the generators that seed the data (`src/lib/seed/`). It reads every number from the parameters. |

Every parameter file is checked when the Atlas loads. A missing or mistyped
value stops it with a message naming the file and key.

## Editing the world

### In the Atlas (the editor)

Run `npm run dev`, open the Atlas and press **✎** (or `E`). The editor exists
only on your machine: it writes your changes straight into the files below,
and the published site leaves it out.

- **Move** anything by dragging it on the chart: a settlement (its roads
  re-route), a platform, a continent or moon (its orbit), an archipelago
  (zoomed out), or an island within its archipelago (zoomed in).
- **Add** a city, town or village by choosing it in the toolbar and clicking dry
  land, or a grand platform or keep by clicking open water.
- **Edit** the selection in the gazetteer's *Edit* section: names, sizes,
  harbours, orbits and periods, coastline seeds, a platform's class, owner or
  motion. `Delete` removes the selected place or platform.
- **Undo** (`Ctrl+Z`) puts the files back as they were before each change.
- **Parameters** tunes the numbers worth judging by eye. Some apply at once
  (shipping, roads, rivers); the rest apply when you **regenerate** places,
  archipelagos or platforms, which overwrites what you regenerate.
- **Warnings** lists anything an edit broke: a town in the sea, a harbour away
  from the water, a platform in a continent's path, archipelagos that will
  collide. `npm test` checks the same.

### The files

| File | Contents |
| --- | --- |
| `src/data/world.yaml` | Units (Imperial Leagues, 1 IL ≈ 1 km), the ocean's radius and edge, the Land of the Large, the continents (position 1–16, orbit radius, starting bearing, period, size, coastline seed, description) and their moons, the belts, the Empire's bands, and the kinds and owners of platforms. |
| `src/data/archipelagos.yaml` | The belts' archipelagos and their islands. |
| `src/data/places/<id>.yaml` | Each body's settlements; see [its README](src/data/places/README.md). |
| `src/data/platforms.yaml` | Every platform, one per line. |
| `src/data/calendar.yaml` | Era name, months and their lengths, intercalary/festival days, weekdays, the date the atlas opens on, and the range of the timeline. |
| `src/data/names.yaml` | The sounds placeholder place names are built from. |
| `src/data/continents/<id>.svg` | Optional hand-drawn continents and moons; see [docs/designing-continents.md](docs/designing-continents.md). |

### Seeding

Archipelagos, settlements and platforms were generated once, then written to
those files. Nothing regenerates unless you ask:

```sh
npm run seed -- archipelagos        # new archipelagos (and their islands' places)
npm run seed -- places [ids…]       # settlements on some bodies (or archipelagos, arch:…), or all
npm run seed -- platforms           # re-site every platform by trade
npm run seed -- all                 # everything, in that order
```

Each overwrites what it seeds, edits included. Terrain, rivers, lakes and
roads are not stored: they are worked out from each body's seed and settlements
whenever the Atlas loads.

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
npm test           # the generators, the data files, orbits, terrain, roads, shipping, the editor
npm run seed -- …  # regenerate data files (see Seeding)
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
  data/places/     each body's settlements
  data/continents/ hand-drawn continent and moon designs (SVG)
  parameters/      tuning: terrain, settlements, roads, belts, platforms, shipping, display
  lib/             calendar, orbits, world parsing, archipelagos, platforms, shipping, coastlines, camera
  lib/terrain/     elevation, water, settlements, roads, archipelago settling and ferries, design reader and template
  lib/seed/        the generators that seed the data files (archipelagos, places, platform siting)
  books/atlas/editor/  the editor (npm run dev only)
scripts/           the seed command, and the editor's server (a Vite plugin) that writes your edits
  books/atlas/     the Atlas: map canvas, renderer, timeline, gazetteer, instruments
  Library.tsx      the Imperial Reference Shelf (home page)
  books.ts         the list of books on the shelf
```
