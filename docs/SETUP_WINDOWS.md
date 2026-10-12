# ReelForge Studio — Setup Guide (Windows)

## Prerequisites

Install these in order:

### 1. Rust (Required for Tauri backend)

```powershell
# Download and run rustup installer
Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "$env:TEMP\rustup-init.exe"
& "$env:TEMP\rustup-init.exe" -y --default-toolchain stable
# Restart your terminal, then verify:
rustc --version
cargo --version
```

### 2. Visual Studio 2022 C++ Workload (Required for MSVC linker)

Visual Studio 2022 Community is already installed but **lacks the C++ workload**.

Option A — Add via VS Installer (recommended):
1. Open **Visual Studio Installer** from Start Menu
2. Click **Modify** next to Visual Studio 2022 Community
3. Check: **"Desktop development with C++"**
4. Click **Modify / Install**
5. Wait (~3–5 GB download)

Option B — Install standalone Build Tools only (smaller):
```powershell
# Download VS Build Tools
Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vs_BuildTools.exe" -OutFile "$env:TEMP\vs_BuildTools.exe"
& "$env:TEMP\vs_BuildTools.exe" --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --quiet --wait
```

After installing C++ tools, verify:
```powershell
& "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
cl
```

### 3. Node.js ✅ (Already installed — v26.7.0)
### 4. FFmpeg ✅ (Already installed — v9.0.2 full build)
### 5. WebView2 ✅ (Already installed — v155)

---

## Project Setup

```powershell
cd "c:\Users\admin\Documents\MY Documents\Programing\my projects\REELFORGE STUDIO"

# Install frontend dependencies
npm install

# Run frontend tests (no Rust required)
npm test

# Start the Vite dev server only (no Tauri — for frontend development)
npm run dev

# Once Rust + MSVC are installed — start the full Tauri app:
npm run tauri dev
```

---

## Environment Validation

Run this after installing Rust and C++ tools:
```powershell
npx @tauri-apps/cli info
```

Expected output (all green):
```
✔ OS: Windows 10
✔ WebView2
✔ MSVC
✔ rustc
✔ Cargo
✔ node
✔ npm
```

---

## FFmpeg Notes

The installed FFmpeg is the **gyan.dev full GPL build v9.0.2**.

Build flags include:
- `--enable-gpl` — GPL v2+ applies to the binary
- `--enable-version3` — LGPLv3/GPLv3 components enabled
- `--enable-libx264` — H.264 encoder (GPL)
- `--enable-libx265` — H.265 encoder (GPL)
- `--enable-mediafoundation` — Windows hardware decode
- `--enable-d3d11va`, `--enable-dxva2` — DirectX hardware acceleration
- `--enable-nvenc`, `--enable-nvdec` — NVIDIA GPU support (optional)

**License implication**: distributing a GPL-linked FFmpeg binary requires your application to be GPL-compatible. For internal/personal use this is not an issue. Consult `docs/LICENSING.md` before commercial redistribution.

---

## Running Tests Without Tauri

The frontend unit tests (Vitest) run entirely in Node.js — no Rust, Tauri, or FFmpeg required:

```powershell
npm test           # run once
npm run test:watch # watch mode
```

---

## Known Limitations (Milestone 0)

| Item | Status |
|---|---|
| Rust not installed | ❌ Must install — see above |
| MSVC C++ tools | ❌ Must add workload — see above |
| `npm run tauri dev` | ❌ Blocked until Rust + MSVC installed |
| `npm run dev` (frontend only) | ✅ Works now |
| `npm test` | ✅ Works now |
| FFmpeg / ffprobe | ✅ Available |
| WebView2 | ✅ Available |
| Node.js 26 / npm 11 | ✅ Available |
