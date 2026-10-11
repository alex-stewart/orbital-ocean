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
| `platforms.yaml` | How many platforms, of which sizes and owners, and how they're spaced |
| `shipping.yaml` | Imperial cargo routes: resupply range, costs, how much trade |
| `display.yaml` | When things appear as you zoom, and how far you can zoom |

Every file is read at startup and checked; a missing or mistyped key stops the
Atlas with a message naming the file and key. Changing a value regenerates
whatever depends on it, deterministically.
