# ReelForge Studio 🎬

> A modern Windows desktop video editor combining creator editing, motion graphics, and finishing workflows.

Built with **Tauri 2**, **Rust**, **React 18**, **TypeScript**, and **Tailwind CSS**.

---

## ✨ Features

- **Integer Tick-Based Timebase**: Timeline engine powered by $240,000$ ticks/second for exact fractional frame-rate support ($23.976$, $29.97$, $30$, $60$ fps) without conversion drift.
- **Multitrack Interactive Timeline**: Snapping engine with magnet toggle, razor split (`Ctrl+B`), delete, multi-select, zoom slider/shortcuts, and ripple editing primitives.
- **Robust Project Persistence**:
  - Versioned JSON schema (`.rfproj`) validated with **Zod**.
  - Cycle detection for nested compositions and referential integrity verification.
  - Deterministic JSON serialization for stable version control diffs.
  - Desktop atomic file writes (`.tmp` flush and rename) and browser Blob download fallbacks.
  - Debounced autosave ($2,000\text{ms}$) with periodic safety interval ($30,000\text{ms}$) and crash recovery snapshot restoration.
  - Non-blocking missing media detection and type-safe asset relinking preserving stable asset IDs.
- **Command & History Model**: Command pattern with linear undo/redo stacks backed by **Immer** and **Zustand**.
- **Media Bin**: Asset library with grid/list views, search filtering, and drag-and-drop to timeline tracks.
- **Modern Dark UI**: Precision interface with custom design tokens, Lucide icons, and status indicators.

---

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| Desktop Runtime | [Tauri 2](https://v2.tauri.app/) (Rust backend) |
| Frontend | React 18, TypeScript (strict mode) |
| State Management | Zustand + Immer |
| Validation | Zod |
| Styling | Tailwind CSS v3 |
| Build Tool | Vite 5 |
| Testing | Vitest (87 unit & integration tests) |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18+ (Node 26+ supported)
- **Rust & Cargo**: (For native Tauri build; see `docs/SETUP_WINDOWS.md`)

### Installation

```bash
# Clone the repository
git clone https://github.com/piyush805829/ReelForge-Studio.git
cd ReelForge-Studio

# Install dependencies
npm install
```

### Development

```bash
# Start Vite development server (Browser Mode)
npm run dev

# Run all tests (Vitest)
npm test

# Run TypeScript type check
npx tsc --noEmit

# Production bundle build
npm run build
```

---

## 📂 Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [Feature Status & Milestones](docs/FEATURE_STATUS.md)
- [Windows Native Setup Guide](docs/SETUP_WINDOWS.md)
- [Licensing & Dependencies](docs/LICENSING.md)

---

## 📄 License

MIT License. See [LICENSE](LICENSE) or [docs/LICENSING.md](docs/LICENSING.md) for details.
