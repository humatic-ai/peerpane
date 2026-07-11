# Humatic AI PeerPane Browser Extension

**PeerPane** is the Humatic AI browser extension — connect to [Planet 9](https://humaticai.com) and chat with your Digital Peer from any web page. Enter your Planet 9 API key in Settings, then use the side panel to stream conversations — optionally attaching the current page (screenshot + text) as context.

PeerPane is powered by [Planet 9](https://humaticai.com) (Digital Peer platform) and sits alongside [BlogPilot](https://humaticai.com/products/blogpilot).

**Full product name:** Humatic AI PeerPane Browser Extension

## Features (Stage 1)

- Planet 9 API key authentication (`X-API-Key`)
- Streaming chat via `POST /chat/stream`
- Thread continuity across follow-up messages
- Suggestion chips from the Peer
- Optional “Attach current page” context
- Local chat history

## Quick start

1. Install dependencies: `pnpm install`
2. Build: `pnpm build`
3. Open `chrome://extensions`, enable Developer mode, **Load unpacked** → select the `dist/` directory
4. Open Settings and enter your Planet 9 API key (from your Peer's API settings)
5. Open the PeerPane side panel and chat

Default API base URL: `https://humaticai.com/ragchat`

## Development

```bash
pnpm install
pnpm dev
```

See also: [Planet 9 Chat API docs](https://humaticai.com/docs/chat-api)

## License and attribution

Licensed under the [Apache License 2.0](LICENSE).

This project is a fork of [nanobrowser](https://github.com/nanobrowser/nanobrowser) (Apache-2.0). See [NOTICE](NOTICE) for upstream attribution and a summary of changes. The Nanobrowser name and marks are trademarks of their respective owners and are not used here as product branding.
