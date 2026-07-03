# Design

## Visual Theme

**Warm paper + restrained amber accent.** A light-mode interface built on barely-differentiable warm neutrals — the sidebar and main content area share the same warm paper tone so the boundary recedes. A single warm amber accent (≤10% surface coverage) carries all interactive emphasis: the send button, selected tabs, links, focus rings. Borders are airy and minimal; the interface breathes through whitespace, not chrome.

Design references: claude.ai (warm paper background, restrained color), Linear (refined typographic hierarchy), Notion (quiet defaults, content-first).

## Color Palette

All colors in OKLCH for perceptual uniformity. Chroma is pinned to hue 86 (warm paper tint) for neutrals, hue 52 (amber) for accent.

### Backgrounds — warm paper hierarchy

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `oklch(0.987 0.004 86)` | Main chat area, page background |
| `--bg-surface` | `oklch(0.993 0.001 86)` | Cards, composer surface, popovers |
| `--bg-sidebar` | `oklch(0.982 0.004 86)` | Left/right sidebars — barely darker than base |
| `--bg-muted` | `oklch(0.955 0.005 86)` | Active/selected items, hover states |
| `--bg-muted-hover` | `oklch(0.945 0.005 86)` | Stronger hover (when needed) |

### Ink — text hierarchy

| Token | Value | Usage |
|-------|-------|-------|
| `--ink` | `oklch(0.20 0.01 86)` | Primary body text, headings |
| `--ink-secondary` | `oklch(0.42 0.01 86)` | Secondary text, file tree items |
| `--ink-muted` | `oklch(0.56 0.01 86)` | Placeholder, disabled, tertiary labels |
| `--ink-inverse` | `oklch(0.985 0.001 86)` | Text on dark/colored backgrounds |

### Accent — warm amber (restrained, ≤10%)

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `oklch(0.63 0.17 52)` | Primary buttons, links, focus rings, active tabs |
| `--accent-hover` | `oklch(0.57 0.17 52)` | Button/link hover |
| `--accent-soft` | `oklch(0.955 0.025 78)` | User message bubbles, subtle accent backgrounds |
| `--accent-foreground` | `oklch(0.33 0.09 50)` | Text on accent-soft backgrounds (user bubbles) |

### Borders — airy, barely-there

| Token | Value | Usage |
|-------|-------|-------|
| `--border` | `oklch(0.91 0.006 86)` | Default border, input outlines |
| `--border-light` | `oklch(0.95 0.003 86)` | Sidebar separators, inner rings |
| `--border-hover` | `oklch(0.87 0.008 86)` | Border on hover/focus |

### Semantic

| Token | Value | Usage |
|-------|-------|-------|
| `--success` | `oklch(0.55 0.13 160)` | Success text |
| `--success-soft` | `oklch(0.95 0.04 155)` | Success background |
| `--error` | `oklch(0.50 0.16 25)` | Error text, destructive buttons |
| `--error-soft` | `oklch(0.96 0.03 25)` | Error background |
| `--warning` | `oklch(0.68 0.15 75)` | Warning text |
| `--warning-soft` | `oklch(0.96 0.06 80)` | Approval card background |

### Depth — warm-tinted shadows

| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px oklch(0.15 0.01 86 / 0.04)` |
| `--shadow-md` | `0 4px 12px oklch(0.15 0.01 86 / 0.06)` |
| `--shadow-lg` | `0 8px 24px oklch(0.15 0.01 86 / 0.08)` |
| `--shadow-xl` | `0 16px 40px oklch(0.15 0.01 86 / 0.10)` |

Shadows are tinted toward the warm paper hue instead of pure black — they feel like natural light shadows on paper.

### Radius scale

`4px` → `6px` → `8px` (default) → `10px` → `14px` → `18px` → `24px`

Default component radius is 8–10px. Composer and dialogs use 14–18px for a softer feel. Pill-shaped elements use `9999px`.

## Typography

### Font stack

**UI text:** `"Geist", "Inter", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", ui-sans-serif, system-ui, -apple-system, sans-serif`

**Code:** `"Geist Mono", "SF Mono", "Cascadia Code", "Roboto Mono", "Consolas", "Liberation Mono", monospace`

Geist (Vercel) is the primary typeface — a clean geometric sans with excellent readability at small sizes. Chinese text falls back through HarmonyOS Sans SC → PingFang SC → Microsoft YaHei. Code uses Geist Mono for a modern, approachable monospace feel.

### Scale

| Role | Size | Weight |
|------|------|--------|
| Page heading (empty state) | 28–34px | 500 (medium) |
| Section heading | 15–18px | 600 (semibold) |
| Body / messages | 14–15px | 400 (regular) |
| UI labels, sidebar items | 12–13px | 500 (medium) |
| Captions, keyboard hints | 11px | 400 |
| Code | 11–13px | 400 |

### Principles

- Body line length capped at ~75ch (680–760px max-width for message area)
- `text-wrap: balance` on headings (h1–h3)
- `leading-relaxed` (1.625) for message body text
- No tiny uppercase tracked eyebrows — section labels use sentence case at natural sizes
- Font smoothing: `antialiased` on macOS, `geometricPrecision` for rendering

## Motion

- **Easing:** `cubic-bezier(0.19, 1, 0.22, 1)` (ease-out-expo) — the sole easing curve. No bounce, no elastic.
- **Durations:** fast (120ms) for micro-interactions, normal (200ms) for state transitions, slow (300ms) for layout changes like sidebar collapse.
- **Sidebar collapse:** `transition-[width] duration-300 ease-expo` — one of the few layout-property animations, intentional since sidebar width changes require layout reflow.
- **Reduced motion:** All animations are purely additive — no content is gated on animation completion. Respect `prefers-reduced-motion` by default (Tailwind's `motion-safe:` variants are implicit).
- **Hover/active:** `transition-colors duration-fast` for color changes, `active:scale-[0.97]` on buttons for tactile feedback.

## Component Patterns

### Buttons

- **Default (primary):** Amber accent background, white text, subtle shadow. Used for the single most important action in a context (send, save).
- **Ghost:** Transparent, ink-muted icon/text, warms to ink on hover with muted background. Default for toolbar and sidebar actions.
- **Destructive:** Red-soft background, red text — used for abort/deny, not for dangerous one-click actions.
- **Size scale:** xs (24px), sm (28px), default (32px), lg (36px). Icon-only variants at each size.

### Inputs

- Border `--border` at 30% opacity in resting state, `--border-hover` at 50% on hover, `--accent` at 50% on focus.
- Focus ring: 2px `--ring` (amber at 45% opacity).
- Placeholder: `--ink-muted` at full opacity (≥4.5:1 contrast vs surface).

### Sidebar items

Three visual states form a clear hierarchy:
- **Resting:** transparent on sidebar background
- **Hover:** `bg-muted` (oklch L=0.955, clearly darker than sidebar L=0.982)
- **Active:** `bg-muted` (same as hover, persistent — feels "pressed in")

### Composer

- Rounded-2xl (18px) pill shape, subtle border, warm white surface
- Focus state: border shifts to accent, shadow deepens slightly
- Send button: 30px amber circle, right-aligned
- Keyboard hint: hidden on mobile, subtle monospace text on desktop

### Chat messages

- **User:** Right-aligned bubble, accent-soft background, accent-foreground text, rounded-2xl with bottom-right corner tighter (br-md)
- **Assistant:** Left-aligned, plain text on background, rendered through Markdown
- **Tool calls:** Inline monospace badges, chevron-expandable detail sections, running indicators with amber pulse dot

### Empty states

Centered composition with generous whitespace. Page heading at 28–34px, medium weight, no decoration. Composer centered below. No illustrations, no "empty state" icons — the emptiness itself is the design.

## Layout

### Three-panel shell

```
[Session Sidebar] [Chat Area] [Files Sidebar]
    260px            flex-1        280px
```

- Sidebar panels are resizable via drag handles (180–480px range)
- Collapsed sidebar: 48px icon-only strip with expand toggle, new session, skills, settings
- Panel borders: `border-line/20` — nearly invisible
- Main content area has no internal horizontal dividers (no top bar border, no composer separator line)

### Chat area

- Messages centered with `max-w-[760px]`
- Generous vertical spacing: messages 20–24px apart, tools grouped tightly
- Composer pinned to bottom, no separating border line

## Technical

### Stack

- **Framework:** React 19 + Vite 8 + TypeScript
- **Styling:** Tailwind CSS 3.4 with CSS custom properties for design tokens
- **Components:** shadcn/ui (base-ui primitives) + custom components
- **Icons:** Lucide React
- **Markdown:** react-markdown + remark-gfm

### Token architecture

Design tokens live in two layers:
1. **CSS custom properties** in `styles.css` `:root` — the canonical OKLCH values
2. **Tailwind `extend.colors`** in `tailwind.config.ts` — aliases that reference the CSS variables

This gives Tailwind utility-class convenience with OKLCH color precision. Opacity modifiers (`bg-muted/50`) don't work with CSS variable colors — use separate tokens for opacity variants.

### shadcn/ui compatibility

shadcn/ui required tokens (`--background`, `--foreground`, `--primary`, `--muted`, `--card`, `--popover`, `--border`, `--ring`, etc.) are mapped to the design system tokens in `:root`. This keeps shadcn components on-brand without per-component overrides.
