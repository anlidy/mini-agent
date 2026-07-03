import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Existing design tokens
        background: "#ffffff",
        foreground: "#242424",
        surface: "#ffffff",
        ink: "#1f1f1f",
        text: "#242424",

        // muted: DEFAULT is the background (for shadcn hover), foreground is the text
        muted: {
          DEFAULT: "#f3f3f3",
          foreground: "#8d8d8d"
        },

        line: "#ececec",

        // accent: DEFAULT is brand blue, soft is light blue bg
        accent: {
          DEFAULT: "#8fc4ff",
          foreground: "#1f64b8",
          soft: "#eff7ff"
        },

        "approval-soft": "#fff6df",
        green: "#008767",
        red: "#b42318",
        sidebar: "#fafafa",
        connector: "#dddddd",
        "tool-bg": "#f7f7f7",

        // shadcn/ui required tokens
        card: "#ffffff",
        "card-foreground": "#242424",
        popover: "#ffffff",
        "popover-foreground": "#242424",
        primary: {
          DEFAULT: "#8a8d91",
          foreground: "#ffffff"
        },
        secondary: {
          DEFAULT: "#f5f5f5",
          foreground: "#242424"
        },
        destructive: {
          DEFAULT: "#b42318",
          foreground: "#ffffff"
        },
        border: "#ececec",
        input: "#ececec",
        ring: "#8fc4ff",

        // Sidebar tokens
        "sidebar-background": "#fafafa",
        "sidebar-foreground": "#2f2f2f",
        "sidebar-primary": "#1f64b8",
        "sidebar-primary-foreground": "#ffffff",
        "sidebar-accent": "#f1f1f1",
        "sidebar-accent-foreground": "#242424",
        "sidebar-border": "#ececec",
        "sidebar-ring": "#8fc4ff"
      },
      borderRadius: {
        ui: "8px"
      },
      fontFamily: {
        sans: [
          "HarmonyOS Sans SC",
          "MiSans",
          "PingFang SC",
          "Microsoft YaHei",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        mono: ["SFMono-Regular", "Cascadia Code", "Roboto Mono", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
} satisfies Config;
