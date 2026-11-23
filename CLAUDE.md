# Project notes for Claude

## Typography

- **Chinese text defaults to Chiron GoRound TC (昭源甜圓體).** Use it for any new
  page, demo, artifact or UI in this repo unless the user asks otherwise.
  - Load it from Google Fonts:
    `https://fonts.googleapis.com/css2?family=Chiron+GoRound+TC:wght@200..900&display=swap`
  - Font stack: `Inter, "Chiron GoRound TC", "Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif`
  - Monospace labels that may contain Chinese should list `"Chiron GoRound TC"`
    as a fallback after the monospace families.
  - Why: the rounded face matches the hub's rounded details (pill buttons,
    rounded tetrahedron, wheel). An unloaded font falls back to each system's
    default (e.g. Microsoft JhengHei), which the user found unattractive.
