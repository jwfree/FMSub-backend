import { useEffect, useState } from "react";

const THEMES = [
  "farmers",
  "light",
  "dark",
  "corporate",
  "emerald",
  "autumn",
  "cupcake",
  "fantasy",
] as const;

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<string>(
    () => localStorage.getItem("theme") || "autumn"
  );

  // apply on mount + whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <label className="flex items-center gap-2 text-sm">
      <select
        className="select select-sm bg-base-100"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
      >
        {THEMES.map((t) => (
          <option key={t} value={t} className="capitalize">
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}