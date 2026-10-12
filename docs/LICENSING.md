# ReelForge Studio — Third-Party Licenses

This document lists all open-source dependencies used in ReelForge Studio.
Consult each license before redistribution.

## Frontend Dependencies

| Package | License | Notes |
|---|---|---|
| react | MIT | Facebook / Meta |
| react-dom | MIT | |
| typescript | Apache 2.0 | Microsoft |
| vite | MIT | |
| @vitejs/plugin-react | MIT | |
| tailwindcss | MIT | |
| lucide-react | ISC | |
| zustand | MIT | |
| immer | MIT | |
| clsx | MIT | |
| tailwind-merge | MIT | |
| class-variance-authority | Apache 2.0 | |
| uuid | MIT | |
| zod | MIT | |
| @radix-ui/* | MIT | All Radix UI primitives |
| @tauri-apps/api | MIT | Tauri Frontend API |
| @tauri-apps/plugin-* | MIT | Official Tauri plugins |

## Backend / Rust Dependencies

| Crate | License | Notes |
|---|---|---|
| tauri | MIT / Apache 2.0 | |
| serde | MIT / Apache 2.0 | |
| serde_json | MIT / Apache 2.0 | |
| tokio | MIT | |
| uuid | MIT / Apache 2.0 | |
| anyhow | MIT / Apache 2.0 | |
| tracing | MIT | |

## System Tools

| Tool | License | Notes |
|---|---|---|
| FFmpeg | **GPL v2+ / GPL v3** | Installed build is gyan.dev full build with GPL components |
| ffprobe | GPL (bundled with FFmpeg) | |
| Rust toolchain | MIT / Apache 2.0 | |
| WebView2 | Microsoft EULA | Redistributable per Microsoft terms |

---

## FFmpeg License Notes

The installed FFmpeg build (`gyan.dev full build v9.0.2`) is compiled with:
- `--enable-gpl` → GPL v2 or later
- `--enable-version3` → GPL v3 / LGPL v3 components enabled
- `--enable-libx264` → GPL (libx264)
- `--enable-libx265` → GPL (libx265)

**Consequence**: This FFmpeg binary is GPL v3. Applications linking or distributing this FFmpeg binary must comply with GPL v3 terms.

For internal/personal use: no issue.

For commercial redistribution:
- You must provide source code or written offer for source
- Or use an LGPL-only FFmpeg build without GPL components
- Consult a legal advisor for your specific situation

For a permissive-licensed FFmpeg, use a build without `--enable-gpl`:
- LGPL build: `--disable-gpl`, removes x264/x265/etc.
- BtbN builds provide LGPL variants: https://github.com/BtbN/FFmpeg-Builds

---

## Fonts

| Font | License | Source |
|---|---|---|
| Inter | SIL Open Font License 1.1 | https://rsms.me/inter/ |
| JetBrains Mono | SIL Open Font License 1.1 | https://www.jetbrains.com/legalnotices/logos_jetbrains_mono/ |

Both fonts are loaded from Google Fonts CDN in development. For offline/production, host locally and confirm license compliance.

---

## Assets

No proprietary assets, templates, or copyrighted artwork are included.
All design elements are produced using open-source tooling.
