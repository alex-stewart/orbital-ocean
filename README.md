# The Orbital Ocean

A reference library for a worldbuilding project: a flat ocean where lesser isles
wheel clockwise about a great Central Isle.

The site opens on **the Library**, a shelf of books. Only **the Atlas** is
written so far; *the Chronicle* and *the Bestiary* are listed as forthcoming.

## The Atlas

Plate I is a chart of the whole ocean on a polar projection centred on the
Central Isle, with north at the top.

- **Pan:** drag the map. Flicks carry on with inertia.
- **Zoom:** scroll, pinch, double-click (shift + double-click zooms out), or use the + / − buttons. Press `0` or ◎ to see the whole ocean again.
- **Islands:** click an island for its gazetteer entry. Double-click one to fly to it. *Follow* keeps the chart centred on it as time passes.
- **Measure:** with an island selected, hover another island to see the distance and bearing between them on the current date.
- **Time:** drag the timeline, step by day, month or year, play at one of several speeds (`space` plays and pauses), or click the date to type one in.
- **Sharing:** the date and selected island are kept in the URL (`#/atlas?date=1000-1-1&isle=isle-iv`).

Distances are drawn to true scale. Zoomed out, each island is a fixed-size
atlas symbol with a label, like a town on a world map. As you zoom in, the
symbol fades into the island's coastline, which is generated as a placeholder
from a seed.

## Editing the world

Both data files are commented YAML:

| File | Contents |
| --- | --- |
| `src/data/calendar.yaml` | Era name, months and their lengths, intercalary/festival days, weekdays, the date the atlas opens on, and the range of the timeline. |
| `src/data/world.yaml` | Units (Imperial Leagues, 1 IL ≈ 1 km), the Central Isle, orbiting isles and their moons (orbit radius, starting bearing, period, size, coastline seed), and belts of islets. |

Everything in them is a placeholder. The current scale: the Central Isle is
420 IL across (about 138,000 IL², between Iceland and Great Britain), and the
outermost isle orbits at 10,000 IL, about a quarter of Earth's circumference.

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
  lib/             calendar, orbits, world parsing, coastline generator, camera
  books/atlas/     the Atlas: map canvas, renderer, timeline, gazetteer, instruments
  Library.tsx      the bookshelf home page
  books.ts         the list of books on the shelf
```
