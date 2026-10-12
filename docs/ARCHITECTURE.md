# ReelForge Studio — Architecture

## Overview

ReelForge Studio is a Windows desktop video-editing application built with Tauri 2 (Rust backend) and a React/TypeScript frontend. It combines three editing workflows: fast creator editing (Quick Edit), advanced motion graphics (Motion Studio), and multitrack finishing (Pro Finishing).

## Technology Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 |
| Rust backend | Rust (stable, msvc toolchain) |
| Frontend framework | React 18 + TypeScript (strict) |
| Build tool | Vite 5 |
| Styling | Tailwind CSS v3 |
| Component library | shadcn/ui |
| Icons | Lucide React |
| Application state | Zustand + Immer |
| Undo/redo | Custom command/history layer |
| Composition rendering | PixiJS (WebGL) for overlays, HTML `<video>` for playback |
| Media processing | FFmpeg / ffprobe (system install or bundled) |
| AI — transcription | whisper.cpp (optional, user-initiated download) |
| AI — LLM | Ollama (optional, user-configured) |
| Testing | Vitest + React Testing Library + Playwright + Rust tests |

## Process Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Tauri WebView (Chromium-based)                          │
│  React UI  ──►  Zustand Store  ──►  Command Layer       │
│                                         │                │
│  PixiJS Canvas (overlays/composition)   │                │
│  HTML <video> elements (playback)       │                │
└────────────────────────────┬────────────┘                │
                             │ invoke() / Tauri IPC        │
┌────────────────────────────▼────────────────────────────┐
│  Tauri Rust Backend (src-tauri)                         │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Commands │  │  Media   │  │  Project │  │  Jobs  │ │
│  │ (IPC)   │  │(ffmpeg)  │  │(I/O,JSON)│  │(queue) │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│                                                          │
│  Security: allowlist, path sandboxing, no raw shell     │
└─────────────────────────────────────────────────────────┘
         │                │                │
    ffmpeg/ffprobe    filesystem         OS process
```

## Module Boundaries

### Frontend (`src/`)

| Module | Responsibility | Must NOT |
|---|---|---|
| `app/` | App bootstrap, routing, global providers | Contain business logic |
| `components/` | Reusable UI primitives | Know about timeline model |
| `workspaces/` | Workspace-level layout and wiring | Contain clip math |
| `timeline/` | Timeline model, commands, history, snapping, time | Touch React directly |
| `media/` | Import, metadata parsing, thumbnail URLs, proxy jobs | Perform filesystem I/O (use Tauri commands) |
| `composition/` | Composition graph, layers, transforms, keyframes | Render to screen |
| `preview/` | Playback clock, compositing, caching | Modify project model |
| `rendering/` | Render graph, FFmpeg job builder, validation | Touch React |
| `audio/` | Audio settings model, waveform data | Decode audio in JS |
| `captions/` | Subtitle model, import/export | Connect to AI directly |
| `ai/` | AI adapter interfaces, provider wrappers | Run in UI thread |
| `project/` | Schema types, serialization, migration, autosave | Perform direct file I/O |
| `state/` | Zustand stores, selectors | Contain rendering |

### Backend (`src-tauri/src/`)

| Module | Responsibility |
|---|---|
| `commands/` | IPC command handlers, argument validation |
| `media/` | ffprobe metadata, thumbnail generation, file validation |
| `process/` | Controlled child-process spawning (FFmpeg, whisper) |
| `project/` | File read/write, autosave, recovery |
| `jobs/` | Background job queue, progress reporting, cancellation |
| `security/` | Path sandboxing, allowlist checks, argument sanitization |

## Time Model

The project uses a **rational timebase** of `240,000 ticks per second`.

```
Conversions:
  tick_count = seconds × 240,000
  frame_number = tick_count ÷ ticks_per_frame
  ticks_per_frame (30fps) = 240,000 ÷ 30 = 8,000 ticks
  ticks_per_frame (23.976fps) ≈ 240,000 ÷ (24000/1001) ≈ 10,010 ticks

Time domains:
  source_time    — original media clock (seconds, rational)
  timeline_ticks — project timeline position (integer ticks)
  comp_ticks     — composition-local time (integer ticks)
  frame_index    — frame number within composition
  px_offset      — UI pixel position (derived, never stored)
```

**NEVER** store pixel positions in the project model. All timing math uses ticks or rational seconds.

## Data Flow: Edit Command

```
User action (drag clip)
  └─► UI event handler
        └─► MoveLayer command (validates inputs)
              └─► History push (serialize before state)
                    └─► Zustand store update (Immer patch)
                          └─► Preview refreshes (subscription)
                                └─► Timeline re-renders
```

## Data Flow: Export

```
User clicks Export
  └─► ExportDialog collects settings
        └─► validateProject() — checks all refs, durations
              └─► buildRenderGraph(project) — pure function, no I/O
                    └─► Tauri command: start_export(graph, settings)
                          └─► Rust job runner spawns FFmpeg
                                └─► Progress events → UI
                                      └─► Output file written
                                            └─► validateOutput(path)
```

## Security Model

- All filesystem operations go through Tauri commands.
- The frontend never constructs shell commands.
- FFmpeg is invoked via `std::process::Command` with an **argument array** (never `shell = true`).
- File paths are validated against an allowlist of sandboxed directories.
- Imported project JSON is schema-validated before any model mutation.
- AI output is treated as untrusted user input; validated before command dispatch.
- No credentials are ever stored in project files.

## Known Limitations (Milestone 0)

- Rust not yet installed — Tauri backend cannot build until rustup + MSVC C++ workload are installed.
- Preview is single-layer HTML video only (composition WebGL overlay is Milestone 2+).
- Export is Milestone 4.
- AI features are Milestone 8.
