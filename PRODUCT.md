# Product

## Register

platform / developer-tool

## Users

Developers building AI-powered workflows: CLI/TUI users who want fast terminal access, web-browser users who want chat-like sessions with file browsing, and SDK consumers who embed the runtime in their own tools. Communication happens through a single `AgentProtocol` contract — in-process or over WebSocket.

## Product Purpose

mini-agent is a self-built TypeScript AI agent runtime. It defines a transport-agnostic agent protocol, provides a tool-calling engine with multi-provider support, and ships with two transport implementations (in-process direct client and WebSocket server) plus reference CLI and Web UI clients. It is not a commercial product; it is a "tool built for oneself" and an exercise in agent architecture — but the protocol contract means any language can build a client on top.

## Brand Personality

**Elegant / Refined / Quiet** — like a well-typeset book or a sheet of warm paper. Never loud. Every pixel earns its place. The design steps back so content (conversation, code, files) takes center stage.

## Anti-references

- **Traditional developer-tool aesthetic**: dark, dense, rough — feels built for machines, not people. No "terminal in a browser."
- **Material Design**: over-saturated colors, heavy shadow cards, floating FABs — too "Android," too engineered.
- **Over-decoration**: gradient text, glassmorphism, meaningless animations — form over function.

Reference direction: claude.ai's warm restraint, Linear's refined typography, Notion's quiet atmosphere.

## Design Principles

1. **Quiet confidence** — Design doesn't shout. Whitespace and precise typography let content surface naturally. No decoration needed to prove itself.
2. **Paper-like warmth** — The interface has temperature, like reading and writing on paper. Avoid the coldness of pure white / pure gray.
3. **Every pixel intentional** — Minimalism isn't "less," it's "precise." Every spacing value, color, and font size has a clear design rationale.
4. **Tool steps back** — Capability doesn't come at the cost of visual noise. The interface keeps the user focused on conversation and code, not on UI chrome.

## Accessibility & Inclusion

- WCAG 2.1 AA contrast compliance
- Light mode first; dark mode as a future iteration
- Respect system `prefers-reduced-motion`
- Chinese content optimized (Chinese font stack, appropriate line-height and letter-spacing)
