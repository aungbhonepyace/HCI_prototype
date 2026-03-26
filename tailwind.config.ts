import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#10231e",
        mist: "#e9f3ef",
        sand: "#f6efe6",
        tide: "#0f766e",
        coral: "#ef6c4d",
        gold: "#f7b267",
      },
      fontFamily: {
        heading: ["Iowan Old Style", "Palatino Linotype", "Book Antiqua", "serif"],
        body: ["Avenir Next", "Gill Sans", "Trebuchet MS", "sans-serif"],
      },
      boxShadow: {
        panel: "0 24px 80px rgba(9, 35, 29, 0.12)",
      },
      backgroundImage: {
        mesh:
          "radial-gradient(circle at top left, rgba(247,178,103,0.28), transparent 38%), radial-gradient(circle at bottom right, rgba(15,118,110,0.2), transparent 44%), linear-gradient(160deg, rgba(255,255,255,0.92), rgba(233,243,239,0.95))",
      },
      keyframes: {
        floatIn: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "float-in": "floatIn 420ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
