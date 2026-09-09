/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Neutral, cool-gray base -- keeps the eye on data, not chrome.
        canvas: "#F5F7F9",      // page background
        surface: "#FFFFFF",     // panels / cards
        surfaceAlt: "#EEF1F4",  // recessed / inset areas (tables, code)
        ink: "#101827",         // primary text
        muted: "#5B6472",       // secondary text
        subtle: "#8A93A0",      // tertiary / placeholder text
        line: "#E1E5EA",        // hairline borders
        lineStrong: "#C7CDD5",  // emphasized borders

        // Pipeline accent -- teal to blue, evokes the electron beam column
        // and diffraction geometry the tool analyzes.
        beam: {
          50: "#EEFBFA",
          100: "#D3F4F1",
          300: "#7FDBD3",
          500: "#12938A",   // primary teal
          600: "#0C7B74",
          700: "#0A635E",
        },
        zone: {
          400: "#5A8DEE",
          500: "#3768D6",   // primary blue
          600: "#2A54B3",
        },
        // Status colors, deliberately desaturated to sit quietly next to data
        ok: "#1E8E5A",
        warn: "#B4771B",
        err: "#C4432B",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(16, 24, 39, 0.04), 0 1px 12px rgba(16, 24, 39, 0.04)",
        node: "0 0 0 4px rgba(18, 147, 138, 0.12)",
      },
      backgroundImage: {
        "beam-gradient": "linear-gradient(180deg, #12938A 0%, #3768D6 100%)",
      },
    },
  },
  plugins: [],
};
