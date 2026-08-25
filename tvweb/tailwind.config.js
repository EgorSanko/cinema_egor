/**
 * Tailwind 3, а не 4 — намеренно. Четвёртая версия выдаёт color-mix, @layer и
 * oklch: движок телевизора, который @layer не знает, выбрасывает содержимое
 * блока целиком, и от интерфейса остаётся голый HTML. Третья версия отдаёт
 * обычный CSS, понятный движкам 2016 года.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0b",
        foreground: "#ffffff",
        primary: { DEFAULT: "#a3e635", foreground: "#0a0a0b" },
        card: "#18181b",
        border: "#27272a",
        muted: { DEFAULT: "#27272a", foreground: "#a1a1aa" },
      },
    },
  },
  plugins: [],
};
