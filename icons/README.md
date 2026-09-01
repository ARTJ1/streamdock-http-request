# Stream Dock icons

## Classic pack (`preview/`)
Original button art — unchanged.  
Widget release: https://github.com/ARTJ1/OBS-Stream-Widget-Statistics-v2/releases/tag/streamdock-icons-v1.0.0

```bash
npm run generate
```

## LIVE pack (`preview-live/`) — C4 Neon Edge
For Live Mode (wins/losses numbers + rank short codes on buttons).

- Neon left edge, watermark, chevron UP/DOWN
- Rank codes: `B5` `S3` `G2` `P1` `I4` `D1` `M2` `GM3` `CH1` `#42`
- Pack PNGs leave the value area empty; demo sheets bake sample values
- Does **not** overwrite classic `preview/`

```bash
npm run generate-live           # all skins
npm run generate-live:default   # default only
```

Open `preview-live/<skin>/_sheet-demo.png` for the full family preview.
