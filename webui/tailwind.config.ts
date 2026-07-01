import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Existing design tokens
        background: "#f6f7f5",
        foreground: "#30353b",
        surface: "#ffffff",
        ink: "#17191d",
        text: "#30353b",

        // muted: DEFAULT is the background (for shadcn hover), foreground is the text
        muted: {
          DEFAULT: "#f4f6f4",
          foreground: "#6f7781"
        },

        line: "#e1e5e2",

        // accent: DEFAULT is brand blue, soft is light blue bg
        accent: {
          DEFAULT: "#315fbd",
          foreground: "#315fbd",
          soft: "#edf3ff"
        },

        "approval-soft": "#fff6df",
        green: "#2d7a58",
        red: "#b42318",
        sidebar: "#fafbfa",
        connector: "#d0d7de",
        "tool-bg": "#f8f9fb",

        // shadcn/ui required tokens
        card: "#ffffff",
        "card-foreground": "#30353b",
        popover: "#ffffff",
        "popover-foreground": "#30353b",
        primary: {
          DEFAULT: "#315fbd",
          foreground: "#ffffff"
        },
        secondary: {
          DEFAULT: "#f4f6f4",
          foreground: "#17191d"
        },
        destructive: {
          DEFAULT: "#b42318",
          foreground: "#ffffff"
        },
        border: "#e1e5e2",
        input: "#e1e5e2",
        ring: "#315fbd",

        // Sidebar tokens
        "sidebar-background": "#fafbfa",
        "sidebar-foreground": "#30353b",
        "sidebar-primary": "#315fbd",
        "sidebar-primary-foreground": "#ffffff",
        "sidebar-accent": "#f4f6f4",
        "sidebar-accent-foreground": "#30353b",
        "sidebar-border": "#e1e5e2",
        "sidebar-ring": "#315fbd"
      },
      borderRadius: {
        ui: "8px"
      },
      fontFamily: {
        mono: ["SFMono-Regular", "Cascadia Code", "Roboto Mono", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
} satisfies Config;
