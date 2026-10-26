/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        "bg-2": token("bg-2"),
        "bg-3": token("bg-3"),
        fg: token("fg"),
        "fg-2": token("fg-2"),
        "fg-3": token("fg-3"),
        sep: token("sep"),
        accent: token("accent"),
        "accent-fg": token("accent-fg"),
        ok: token("ok"),
        warn: token("warn"),
        bad: token("bad"),
        info: token("info"),
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "Inter", "system-ui", "sans-serif"],
        display: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Display"', "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "large-title": ["34px", { lineHeight: "41px", letterSpacing: "0.01em", fontWeight: "700" }],
        title2: ["22px", { lineHeight: "28px", fontWeight: "700" }],
        title3: ["20px", { lineHeight: "25px", fontWeight: "600" }],
        headline: ["17px", { lineHeight: "22px", fontWeight: "600" }],
        body: ["17px", { lineHeight: "22px" }],
        callout: ["16px", { lineHeight: "21px" }],
        subhead: ["15px", { lineHeight: "20px" }],
        footnote: ["13px", { lineHeight: "18px" }],
        caption: ["12px", { lineHeight: "16px" }],
      },
      borderRadius: { card: "20px", ctl: "12px" },
      opacity: { 6: "0.06", 8: "0.08", 12: "0.12", 14: "0.14", 18: "0.18", 35: "0.35" },
    },
  },
  plugins: [],
};
