# Parameters

The tuning knobs of the simulation, one file per system. Everything here is a
number or a rule: **how much, how often, how strongly**. It is not lore. What
exists and what it's called lives in [`src/data/`](../data/), and how it all
works lives in the code under [`src/lib/`](../lib/).

| File | Tunes |
| --- | --- |
| `terrain.yaml` | Height grids, generated relief, lakes and rivers, design limits |
| `settlements.yaml` | How many places, of what size, where they choose to stand |
| `roads.yaml` | How roads weigh slope, height, bridges and existing roads |
| `platforms.yaml` | How many platforms, of which sizes and owners, and how they're sited by trade |
| `belts.yaml` | Archipelagos in the belts: how many, how big, how populated |
| `shipping.yaml` | Imperial cargo routes: resupply range, costs, how much trade |
| `display.yaml` | When things appear as you zoom, and how far you can zoom |

Every file is read at startup and checked; a missing or mistyped key stops the
Atlas with a message naming the file and key.

Some numbers act at once: terrain and water, roads, shipping and display.
Others shape what the generators **seed**: settlement density and mix,
archipelagos, platform counts and siting. Those take effect only when you
regenerate (`npm run seed -- …`, or from the editor), because settlements,
archipelagos and platforms are kept in `src/data/` and edited from there.
The editor's Parameters panel (`npm run dev`, ✎) shows which is which.
