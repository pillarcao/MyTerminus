import { THEMES } from '@shared/types';

interface Props {
  currentTheme: string;
  onChange: (themeId: string) => void;
}

export default function ThemeSelector({ currentTheme, onChange }: Props) {
  return (
    <div className="theme-selector">
      <select
        onChange={(e) => onChange(e.target.value)}
        className="theme-select"
        value={currentTheme}
      >
        {THEMES.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.name}
          </option>
        ))}
      </select>
    </div>
  );
}