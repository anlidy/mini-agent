import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#f6f7f5",
        surface: "#ffffff",
        ink: "#17191d",
        text: "#30353b",
        muted: "#6f7781",
        line: "#e1e5e2",
        accent: "#315fbd",
        "accent-soft": "#edf3ff",
        "approval-soft": "#fff6df",
        green: "#2d7a58",
        red: "#b42318",
        sidebar: "#fafbfa",
        connector: "#d0d7de",
        "tool-bg": "#f8f9fb"
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
