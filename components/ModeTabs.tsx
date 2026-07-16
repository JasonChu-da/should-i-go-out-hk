import { ACTIVITY_MODES, type ActivityMode } from "@/lib/scoring/types";

interface ModeTabsProps {
  mode: ActivityMode;
  onChange: (mode: ActivityMode) => void;
}

export function ModeTabs({ mode, onChange }: ModeTabsProps) {
  return (
    <div className="mode-tabs" role="group" aria-label="選擇外出模式">
      {ACTIVITY_MODES.map((option) => (
        <button
          className="mode-tab"
          data-active={mode === option.id}
          type="button"
          key={option.id}
          aria-pressed={mode === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

