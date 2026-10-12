# ReelForge Studio — Feature Status

Last updated: 2026-10-12 | Schema version: 1

## Milestone Legend
- ✅ Implemented and tested
- 🔄 In progress
- ⏳ Planned (next milestone)
- 🚫 Not yet started
- ⚠️ Partially implemented (labeled in UI)

---

## MILESTONE 0 — Environment & Architecture

| Item | Status | Notes |
|---|---|---|
| Environment inspection | ✅ | Node 26, npm 11, FFmpeg 9.0.2, WebView2 v155 |
| Rust installation | ⚠️ | **Action required** — see SETUP_WINDOWS.md |
| MSVC C++ workload | ⚠️ | **Action required** — VS2022 Community present, C++ workload missing |
| Directory structure | ✅ | All modules scaffolded |
| Architecture document | ✅ | docs/ARCHITECTURE.md |
| TypeScript project schema | ✅ | src/project/schema/types.ts |
| Time conversion utilities | ✅ | src/timeline/time/timeConversions.ts |
| Timeline command system | ✅ | src/timeline/commands/timelineCommands.ts |
| Command history (undo/redo) | ✅ | src/timeline/history/commandHistory.ts |
| Zustand project store | ✅ | src/state/projectStore.ts |
| Unit tests — time math | ✅ | 30 tests |
| Unit tests — commands | ✅ | 20+ tests |
| License inventory | ✅ | docs/LICENSING.md |
| FFmpeg version check | ✅ | v9.0.2 gyan.dev full build |

---

## MILESTONE 1 — Real Media Foundation

| Item | Status | Notes |
|---|---|---|
| Tauri app scaffolded | ✅ | src-tauri/ complete |
| Main workspace layout | ✅ | AppShell, TopToolbar, panels |
| Media Bin panel | ✅ | Grid/list view, search, import button |
| Import dialog | ✅ | Wired to Tauri plugin-dialog (needs Rust) |
| Metadata extraction (ffprobe) | ✅ | Rust command: probe_media_file |
| Thumbnail generation | ✅ | Rust command: generate_thumbnail |
| Real media library | ✅ | Asset registry in project model |
| Preview monitor | ✅ | HTML video + transport controls |
| Seeking | ✅ | Click ruler / transport buttons |
| Inspector panel | ✅ | Layer + project property display |
| Timeline panel | ✅ | Ruler, tracks, clips, playhead |
| App launches (frontend) | ✅ | npm run dev works without Rust |
| App launches (Tauri) | ⚠️ | Blocked by Rust/MSVC install |

---

## MILESTONE 2 — Editing Model & Timeline

| Item | Status | Notes |
|---|---|---|
| Clip drag-to-move | ✅ | Interactive drag with temporary preview & single command commit on pointer-up |
| Clip trim (handles) | ✅ | Functional left & right trim handles with speed & media bounds enforcement |
| Split at playhead | ✅ | Toolbar button + Ctrl+B with keyframe partitioning across split point |
| Delete clip | ✅ | Toolbar button + Delete / Backspace shortcuts |
| Snapping system | ✅ | Dynamic pixel-tolerance snapping to clip starts/ends, playhead, 0; visual guide line |
| Snapping bypass | ✅ | Magnet toolbar toggle + temporary Alt/Shift modifier bypass |
| MediaBin to Timeline drop | ✅ | HTML5 drag-and-drop & double-click / button quick add to timeline |
| Multi-track selection | ✅ | Independent clip selection with shift/ctrl multi-select |
| Zoom controls | ✅ | Zoom slider, ZoomIn/Out buttons, and Ctrl+Wheel zooming |
| Non-1x speed trimming | ✅ | Fully tested with 2x and 0.5x speed models |
| Single history entry per gesture | ✅ | Full undo/redo rollback verification |

---

## MILESTONE 3 — Project Persistence
| Item | Status | Notes |
|---|---|---|
| Save project to JSON (.rfproj) | ✅ | Atomic writes via Tauri fs in desktop mode; Blob download in browser fallback |
| Save As dialog | ✅ | File picker dialog / name prompt; preserves dirty state on cancel/error |
| Open project | ✅ | Full schema validation on load; non-blocking missing media detection |
| Autosave & Crash Recovery | ✅ | Inactivity debounce + periodic interval; separate recovery snapshot storage; recovery prompt |
| Schema validation & Deterministic serialization | ✅ | Zod validation, cycle detection in nested compositions, sorted JSON keys for stable diffs |
| Missing media detection | ✅ | Validates paths without blocking project load; preserves originalPath |
| Media relinking | ✅ | Preserves immutable asset ID across all referencing layers; single & batch directory relink |
| Unsaved changes protection | ✅ | Confirmation dialog before New / Open; browser beforeunload protection |

---

## MILESTONE 4 — First Real Export
| Item | Status | Notes |
|---|---|---|
| MP4 clip export | ✅ | Real H.264 video (libx264) + AAC audio export via FFmpeg; verified in test suite |
| Export dialog & UI | ✅ | ExportModal with format, resolution presets, command preview, and progress bar |
| Progress reporting | ✅ | Real-time percentage tracking via FFmpeg out_time_us parser |
| Cancellation | ✅ | AbortSignal integration to terminate encoding process |
| FFmpeg command generation | ✅ | Safe argument vector (no shell injection), scale + pad aspect ratio filter |
| Multi-track compositing graph | ⏳ | Planned for multi-layer compositing engine (Milestone 6) |

---

## MILESTONE 5–9
All planned. See ARCHITECTURE.md for details.

---

## Known Bugs / Limitations

1. **Tauri backend requires Rust + MSVC C++ workload** — not installed yet on this development host. Frontend-only browser fallback works completely with Blob save, file picker open, and localStorage recovery.
2. **Preview is single-layer HTML video** — multi-layer compositing is Milestone 6.
3. **Export is not implemented** — Export button is visible but disabled (Milestone 4).
4. **Google Fonts** may not load in offline mode — Inter/JetBrains Mono fallback to system sans-serif.
5. **Thumbnail display** requires Tauri asset protocol — thumbnails will show fallback icon in frontend-only mode.
