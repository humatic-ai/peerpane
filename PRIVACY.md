# Privacy Policy for PeerPane

**Product:** Humatic AI PeerPane Browser Extension  
**Operator:** HumaticAI  
**Public URL:** https://humaticai.com/privacy#peerpane  

Last updated: July 11, 2026

## Introduction

PeerPane is an open-source Chrome extension that lets you chat with your [Planet 9](https://humaticai.com/planet9) Digital Peer from any web page. This policy explains what data the extension handles and how it is used.

PeerPane is licensed under Apache License 2.0. Source code is available in the PeerPane repository. PeerPane is a fork of Nanobrowser; Nanobrowser trademarks are not used as product branding here.

## What PeerPane does

- You connect PeerPane to **Planet 9** with your own API key.
- Chat messages stream to your configured Planet 9 endpoint (default: `https://humaticai.com/ragchat`).
- Optionally, you can **attach the current page** (screenshot and page text) so your Peer can use that context.
- Chat history, settings, and your API key are stored **locally** in the browser (Chrome extension storage).

## Data we process

### Stored on your device
- Planet 9 API key and base URL (you enter these in Settings)
- Chat history and thread IDs for continuity
- Extension preferences (including analytics on/off)
- An anonymous analytics ID (if analytics is enabled)

We do not require a PeerPane account separate from your Planet 9 API key.

### Sent to Planet 9 (when you use chat)
When you send a message, PeerPane transmits:
- Your message text
- Your API key (as `X-API-Key` authentication)
- Thread identifiers needed for conversation continuity
- If you enable “Attach current page”: a screenshot and/or extracted page text, plus page URL/title as needed for context

That data is processed under HumaticAI’s Planet 9 / website practices described at https://humaticai.com/privacy, and any terms that apply to your Planet 9 tenant.

### Optional anonymous analytics
Analytics is **on by default** and can be turned **off** in extension settings.

When enabled and a PostHog key is configured in the build, PeerPane may send:
- Anonymous usage events (e.g. task timing, error categories)
- Domain names of pages you interact with in automation-related flows (hostname only — not full URLs with paths/queries in analytics payloads)
- A randomly generated anonymous user ID

Analytics does **not** intentionally collect:
- Your Planet 9 API key
- Full page content or screenshots
- Personal contact details you type into chat (chat content goes to Planet 9, not to analytics as message bodies)

Analytics, when used, is processed by PostHog solely to improve the extension. Data is not sold to advertisers.

## What we do not do

- We do not sell your personal data.
- We do not use attached page content for advertising.
- We do not claim that PeerPane “runs entirely offline” for AI chat — chat and optional page attach require network access to Planet 9.

## Your controls

- Clear chat history and change settings anytime in the extension
- Disable analytics in extension settings
- Remove your API key from Settings
- Uninstall PeerPane to remove local extension storage (subject to Chrome’s uninstall behavior)

## Children’s privacy

PeerPane is not directed to children under 16. Do not use the extension if you are under 16.

## Changes

We may update this policy. Material changes will be reflected on https://humaticai.com/privacy#peerpane and in this file’s “Last updated” date.

## Contact

Email: ceo@humaticai.com  

HumaticAI
