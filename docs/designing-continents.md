# Designing a continent by hand

Every continent and moon in the Atlas starts as a **generated placeholder**: a coastline, terrain, rivers, lakes, settlements and roads, all made up from its seed. You can replace any continent with your own **hand-drawn design**: an SVG drawing with named layers, made in Inkscape, Figma or any vector editor.

A design replaces exactly what you draw and nothing else. The Atlas works out the rest:

| You draw | The Atlas works out |
| --- | --- |
| The coastline (required) | — |
| Height contours, peaks | Elevation everywhere in between. If you draw no contours, terrain is generated inside your coast. |
| Lakes | If you draw no lakes, they form where the terrain has basins. |
| Rivers | If you draw no rivers, they run where water gathers. Your rivers are turned to flow downhill if drawn backwards. |
| Settlements | If you draw none, they're placed by the population rules for the continent's band. Each one is checked for being on a river or a navigable river. |
| Roads (optional) | If you leave the roads layer empty, roads are routed over your terrain between your settlements. |

---

## Quick start

1. Open the Atlas, select the continent, and in the gazetteer click **Download design template**. You get `<continent id>.svg`, pre-filled with the continent's current map in every layer.
2. Open it in **Inkscape** (free; recommended). Show the layers with **Layer → Layers and Objects…**.
3. Edit, redraw or delete whatever you like (see [the layers](#the-layers)).
4. Save it as **`src/data/continents/<id>.svg`**, for example `src/data/continents/mort.svg` (moons work the same way: `mort-i.svg`). The filename must match the `id` in `src/data/world.yaml`.
5. Run `npm run dev` and open the Atlas. The continent now uses your design, and its gazetteer entry says *Drawn by hand*. Keep the Atlas open while you work: each time you save the SVG, the chart updates in place.
6. Run `npm test` to check the design, then commit it.

To go back to the generated placeholder, delete the file.

Belt islands can be drawn the same way (select one, then download its template). Their ids come from their generated names, so a design is tied to the current `belts.yaml` and `names.yaml`: change those and the island may be renamed. A belt island's coast must also stay within 1.45 × its radius (`coast_reach` in `belts.yaml`, shown by the guide's outer circle), so it can't touch its neighbours.

---

## Space and scale

- **1 unit = 1 Imperial League (IL)**, roughly a kilometre.
- **0,0 is the continent's centre.** x runs east and y runs **south**, the SVG convention, so **north is up**.
- The template's `viewBox` already sets this up. Don't change the viewBox or move the page. Moving and transforming *shapes* is fine, since all transforms are applied.
- The template has a locked **guide** layer with two circles:
  - the continent's nominal **radius** from `world.yaml` (its area should be close to that circle's);
  - the **limit** at 1.6 × radius. The coast must stay inside it, or the Atlas will refuse the design. Orbits, moons and platforms are spaced on the assumption that each continent stays within its size.
- To make a continent bigger or smaller, change its `radius` in `world.yaml` first, then download a fresh template.

Typical sizes for orientation:

| Continent | Radius | Across |
| --- | --- | --- |
| Land of the Large | 210 IL | ≈ 420 IL |
| Holy Purple Homeland | 95 IL | ≈ 190 IL |
| Continent 7 (smallest) | 40 IL | ≈ 80 IL |

---

## The layers

The Atlas finds layers **by name**: the layer's label in Inkscape, or the group's `id` in other editors. Names aren't case-sensitive, and extra words after the name are fine (`roads (hand-drawn)`). Any other layer, such as `guide`, sketches or notes, is ignored.

| Layer | Shapes | Label each shape with | Required |
| --- | --- | --- | --- |
| `coast` | Closed outlines of land | (nothing) | **Yes** |
| `contours` | Closed lines of equal height | Its height in metres: `500` | No |
| `peaks` | A dot or small circle | Height, optionally a name: `Mount Ost 1800` | No |
| `lakes` | Closed outlines | Optional name: `Lake Still` | No |
| `rivers` | Lines, from source to mouth | Optional name; add `navigable` for boat traffic | No |
| `settlements` | A small circle at the centre of the place | `city Name`, `town Name` or `village Name`; add `port` for a harbour | No |
| `roads` | Lines between settlements | `highway`, `road` or `track` | No (empty = automatic) |

Shapes can be paths, circles, ellipses, rectangles, polygons, polylines or lines. Curves of every kind are supported. Text objects, images, clip paths and masks are ignored.

### coast

- Draw each landmass as a **closed** shape. Several are fine: a main island plus islets.
- A closed shape *inside* another becomes water, such as a lagoon or an inland sea. (Lakes are better drawn in the lakes layer, which gives them shorelines and lets rivers use them.)
- Keep it within the 1.6 × radius limit circle.

### contours

Contours are the most direct way to shape the land.

- Each contour is a **closed** line labelled with its height in **metres**: `200`, `500`, `1,200 m` and `1200 metres` all work.
- The coast counts as height 0.
- Nest contours like tree rings: a 500 line inside a 200 line, inside the coast. Separate hills each get their own rings at the same height.
- A ring drawn *inside* a same-height ring makes a hollow, the even-odd rule.
- Between two contours, height is interpolated by distance, so **lines drawn close together make steep slopes** and lines far apart make gentle ones. Inside the highest ring, the ground rises gently to a summit about half a contour step higher, unless a peak says otherwise.
- Use any spacing. The generated maps use 100–500 m steps depending on the relief.
- Draw no contours at all to keep generated terrain inside your coastline.

Reference heights: generated continents peak at about 1,000–1,600 m, and the Land of the Large at about 3,000 m. Tints run from pale lowland green-buff, through ochre uplands and grey-brown rock, to snow above about 3,000 m.

### peaks

- A small circle (or any shape) at the summit, labelled with its height and optional name: `1800`, `Mount Ost 1800`, `The Old Tor 950 m`.
- The ground nearby is raised smoothly to that height.

### lakes

- Closed outlines, optionally labelled with a name.
- Drawing **any** lake switches off the generated lakes on that continent, so you get exactly the lakes you drew.

### rivers

- Lines from source to mouth. Draw them in either direction; each river is turned to run from its higher end to its lower.
- End a river at the coast, at a lake, or on another river (a tributary).
- Add **`navigable`** to the label for rivers that boats can travel. They're marked with a dashed route line, and settlements along them become river ports.
- Drawing **any** river switches off the generated rivers on that continent.

### settlements

Label each settlement's circle with its kind and name. Optionally add `port` (or `harbour`):

```
city Varrowick
town Ostmere port
village Hale
Little Wick (village)
```

- The kind can come first or last; everything else is the name.
- **City**: the largest places. Shown first when zoomed out, with a ringed symbol and small capitals, and joined by highways.
- **Town**: shown at medium zoom as a solid dot.
- **Village**: shown up close as an open circle, joined by tracks.
- `port` marks a harbour, shown with an anchor. Use it for places on the coast, ready for sea routes later.
- Names must be unique on a continent. Each settlement gets the id `<continent id>/<name>`, used in links (`#/atlas?place=mort/varrowick`).
- Put settlements on dry land, not in a lake or the sea. The gazetteer notes any that aren't.

### roads

- **Leave the layer empty** (the template's default) to have roads routed for you.
- **Draw roads** to fix them by hand. If the layer has any lines, *only* those lines are used. Label each `highway`, `road` or `track` (default: road). A road's ends are linked to any settlement within about 4% of the continent's radius.
- The template's guide layer shows the generated roads, faintly, as a reference to trace or ignore.

---

## How the generated parts behave

This section helps you draw designs that sit naturally beside the generated continents, and explains what the Atlas does with your drawing.

### Population

Settlement counts follow the **band** the continent orbits in (a moon counts as its parent's band). The inner ocean is busy and the frontier is sparse. From `src/parameters/settlements.yaml`:

| Band | Settlements per 10,000 IL² of land |
| --- | --- |
| Home Band | 9 |
| Second Band | 3.5 |
| Frontier Band | 1.4 |

Belt islands are settled per archipelago instead: a belt has as many places as a continent of its land would (`belt_density`), shared among its settled archipelagos by land area.

The mix is about **65% villages, 25% towns and 10% cities**. Every continent gets at least one town, every moon at least a village, and any body with six or more settlements at least one city. A single body can override its band with `settlement_density:` in `world.yaml`.

Generated settlements keep at least **30 IL** from a city, **14 IL** from a town and **6 IL** from a village (`spacing` in the same file). They prefer low, gentle ground near fresh water, with about a fifth on the coast as harbours.

### Roads

- Settlements are joined into a network that reaches every settlement on a landmass, plus extra links between nearby towns and cities, forming loops.
- Each link is routed over the terrain. Steep ground costs more and more, so roads wind up hillsides and keep to valleys. High ground costs a little extra. The sea and lakes can't be crossed, and **crossing a river costs a bridge**, so roads cross rivers rarely and deliberately.
- Important roads are routed first, and later roads are drawn onto them, so they merge rather than run side by side.
- **Ranks:** city to city is a **highway**, links involving a town are **roads**, and links involving a village are **tracks**.
- The costs (slope, height, bridges, reuse) are in `src/parameters/roads.yaml`.
- Settlements on separate landmasses aren't joined by road; that's for sea routes.

### Rivers and lakes

Generated water flows downhill from every point to the sea. Basins deep enough fill up as lakes. Where enough water gathers, a stream becomes a river, and the largest rivers become navigable from the point where they're big enough. The thresholds are in `src/parameters/terrain.yaml`.

### Sea trade

Each body's largest harbour is its **chief port**, the one that appears on the Imperial shipping routes. Mark a city or town on the coast with `port` to make it eligible.

---

## Checking your work

- **Errors** stop the Atlas loading and name the file and the problem:
  - no `coast` layer, or no closed outline in it;
  - a coast reaching beyond 1.6 × the continent's radius;
  - a file named after a continent or moon that doesn't exist.
- **Notes** (warnings) don't stop anything. They list shapes that were skipped and why: a contour without a height, a settlement without a kind, and so on. They appear in the browser console and as a count in the continent's gazetteer entry.
- `npm test` loads every design and checks it.

---

## Editor tips

**Inkscape**

- To label a shape, select it, open **Object → Object Properties** (Ctrl+Shift+O), set **Label** and press **Set**. Or double-click its name in **Layers and Objects**.
- To create a layer, use **Layer → Add Layer…** and name it exactly as in the table.
- Use the **Ellipse tool** with Ctrl held for settlement circles, and the **Bezier tool** for coasts, contours and rivers. Close a shape by clicking its first node.
- Save as **Inkscape SVG** or **Plain SVG**; both work.

**Figma and other editors**

- Name frames or groups `coast`, `contours` and so on, and name each shape with its label. Export as SVG with **Include "id" attribute** on, since names travel as `id`s. Underscores are read as spaces, so `city_Varrowick` works.
- Keep the artboard centred on 0,0 at 1 unit per IL. The simplest way is to start from the downloaded template.

---

## A worked example

[`docs/example-continent.svg`](example-continent.svg) is a small continent that uses every layer: two landmasses, three contours, a named peak, a lake, a navigable river and a tributary, a city with a harbour, a town and two villages. Copy it to `src/data/continents/continent-7.svg` to see it on the chart.
