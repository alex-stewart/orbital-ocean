# The Orbital Ocean

A reference library for a worldbuilding project. The Orbital Ocean is a perfect
circle surrounded by the Endless Gunk. At its centre sits the Land of the
Large, the largest known landmass. Thirteen medium continents and two belts of
tiny islands orbit it clockwise, most continents attended by up to three moons,
and thousands of ocean platforms dot the water between them. Each continent
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

- **Pan:** drag the map. Flicks carry on with inertia.
- **Zoom:** scroll, pinch, double-click (shift + double-click zooms out), or use the + / − buttons. Press `0` or ◎ to see the whole ocean again.
- **Islands:** click an island for its gazetteer entry. Double-click one to fly to it. *Follow* keeps the chart centred on it as time passes.
- **Measure:** with an island selected, hover another island to see the distance and bearing between them on the current date.
- **Time:** drag the timeline, step by day, month or year, play at one of several speeds (`space` plays and pauses), or click the date to type one in.
- **Layers:** ☰ (or `L`) toggles moons, belts, anchored and orbital platforms, orbit lines, the imperial bands, range rings and names, with a key to the platform symbols. Choices are remembered in this browser.
- **Platforms:** look one up by register number in the gazetteer (just the digits work too, e.g. `1423`).
- **Sharing:** the date and selected place are kept in the URL (`#/atlas?date=1000-1-1&place=mort`).

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

## Ocean platforms

Platforms are generated from rules in `world.yaml` (seed, counts per band,
size classes, owners), so there are thousands without listing each one. Every
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

## Editing the world

The world is defined by these files in `src/data`:

| File | Contents |
| --- | --- |
| `src/data/calendar.yaml` | Era name, months and their lengths, intercalary/festival days, weekdays, the date the atlas opens on, and the range of the timeline. |
| `src/data/continents/<id>.svg` | Optional hand-drawn continents; see [docs/designing-continents.md](docs/designing-continents.md). |
| `src/data/world.yaml` | Units (Imperial Leagues, 1 IL ≈ 1 km), the ocean's radius and edge, the Land of the Large, the continents (position 1–16, orbit radius, starting bearing, period, size, coastline seed, description) and their moons, the belts, the Empire's bands, and the rules for generating platforms and settlements. |

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
npm test           # calendar and orbit maths
npm run build      # typecheck + production build into dist/
```

### Deployment

`.github/workflows/pages.yml` runs the tests and build on every pull request
and push. Each push to `main` is then published to GitHub Pages automatically.
In the repository settings, under **Pages → Build and deployment → Source**,
choose **GitHub Actions** (one-time setup).

Built with React, TypeScript and Vite. The chart is drawn on a 2D canvas
(`src/books/atlas/render.ts`); the UI around it is ordinary React.

```
src/
  data/            calendar.yaml, world.yaml (edit these)
  data/continents/ hand-drawn continent designs (SVG)
  lib/             calendar, orbits, world parsing, platform generator, coastlines, camera
  lib/terrain/     elevation, water, settlements, roads, design reader and template
  books/atlas/     the Atlas: map canvas, renderer, timeline, gazetteer, instruments
  Library.tsx      the Imperial Reference Shelf (home page)
  books.ts         the list of books on the shelf
```
