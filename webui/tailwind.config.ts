import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ── Background hierarchy ─────────────────────────────── */
        background: "var(--bg-base)",
        foreground: "var(--ink)",
        surface: "var(--bg-surface)",

        /* ── Muted (for shadcn hover states) ──────────────────── */
        muted: {
          DEFAULT: "var(--bg-muted)",
          foreground: "var(--ink-muted)",
        },

        /* ── Accent — warm amber, restrained ≤10% ────────────── */
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
          soft: "var(--accent-soft)",
        },

        /* ── Ink / text tokens ────────────────────────────────── */
        ink: "var(--ink)",
        "ink-secondary": "var(--ink-secondary)",
        "ink-muted": "var(--ink-muted)",

        /* ── Borders ──────────────────────────────────────────── */
        line: "var(--border)",
        "line-light": "var(--border-light)",
        "line-hover": "var(--border-hover)",

        /* ── Semantic ─────────────────────────────────────────── */
        green: "var(--success)",
        "green-soft": "var(--success-soft)",
        red: "var(--error)",
        "red-soft": "var(--error-soft)",

        /* ── Sidebar ──────────────────────────────────────────── */
        sidebar: "var(--bg-sidebar)",
        "sidebar-foreground": "var(--ink)",
        "sidebar-primary": "var(--accent)",
        "sidebar-primary-foreground": "var(--ink-inverse)",
        "sidebar-accent": "var(--bg-muted)",
        "sidebar-accent-foreground": "var(--ink)",
        "sidebar-border": "var(--border-light)",
        "sidebar-ring": "var(--ring)",

        /* ── Tool / code backgrounds ──────────────────────────── */
        "tool-bg": "var(--bg-muted)",
        connector: "var(--border-light)",

        /* ── Approval (warning) ───────────────────────────────── */
        "approval-soft": "var(--warning-soft)",

        /* ── shadcn/ui required tokens ────────────────────────── */
        card: "var(--bg-surface)",
        "card-foreground": "var(--ink)",
        popover: "var(--bg-surface)",
        "popover-foreground": "var(--ink)",
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "var(--ink-inverse)",
        },
        secondary: {
          DEFAULT: "var(--bg-muted)",
          foreground: "var(--ink)",
        },
        destructive: {
          DEFAULT: "var(--error)",
          foreground: "var(--ink-inverse)",
        },
        border: "var(--border)",
        input: "var(--border)",
        ring: "var(--ring)",
      },

      /* ── Border radius ──────────────────────────────────────── */
      borderRadius: {
        ui: "var(--radius)",
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },

      /* ── Typography ─────────────────────────────────────────── */
      fontFamily: {
        sans: [
          "Geist",
          "Inter",
          "HarmonyOS Sans SC",
          "PingFang SC",
          "Microsoft YaHei",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: [
          "Geist Mono",
          "SF Mono",
          "Cascadia Code",
          "Roboto Mono",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },

      /* ── Box shadow ─────────────────────────────────────────── */
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
      },

      /* ── Transition timing ──────────────────────────────────── */
      transitionTimingFunction: {
        "ease-expo": "var(--ease-out-expo)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow: "var(--duration-slow)",
      },
    },
  },
  plugins: [],
} satisfies Config;
