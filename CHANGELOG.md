# Changelog

All notable changes to **PeerPane** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.14] - 2026-08-06

### Added

- Side panel webchat parity: Markdown (GFM), scroll-to-latest FAB, expandable composer, read-aloud (TTS)
- Chat history UI: search, relative time, delete, Lucide icons
- Options sidebar **Close** item (pinned footer)
- Attach-page tooltip shows on/off status; enabled state solid red (no pulse)
- Local preview harness (`preview.html`) and agent docs for zip + release workflow

### Changed

- Full-width history layout; preview single-view uses full viewport width
- Planet 9 voice synthesize uses agent `tts_voice` when client omits `voice`

## [0.1.13] - 2026-07-28

### Added

- Humatic AI PeerPane browser extension for Planet 9 Digital Peers
- Planet 9 API key auth, streaming chat, thread continuity, suggestion chips
- Optional “Attach current page” context and local chat history

See git tags `v0.1.0` … `v0.1.13` for incremental Chrome extension releases.
