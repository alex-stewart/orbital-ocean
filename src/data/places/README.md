# Places

One file per body that has settlements: `<body id>.yaml`, a list of

```yaml
- {name: Wrusands, kind: city, x: 34.06, y: 45.71, harbour: true}
```

- **kind**: `city`, `town` or `village`.
- **x / y**: IL from the body's centre; x runs east, y runs south (north is up).
- **harbour**: `true` keeps a harbour. It only counts on the shore or by a
  navigable river; elsewhere the Atlas warns.

Roads are routed between the places each time the Atlas loads; you don't list them.

These files were seeded by `npm run seed -- places` and are yours to edit, by
hand or in the Atlas's editor (`npm run dev`, then ✎ or `E`). Regenerating a
body's places (`npm run seed -- places <body id>`) overwrites its file. A body
with no file has no settlements. A hand-drawn design that draws its own
settlements (see docs/designing-continents.md) takes precedence over its file.
