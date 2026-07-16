import { ACTIVITY_MODES, type ActivityMode } from "@/lib/scoring/types";
import { AppIcon, type AppIconName } from "@/components/AppIcon";

const MODE_ICONS: Record<ActivityMode, AppIconName> = {
  general: "walk",
  exercise: "bicycle",
  laundry: "laundry",
};

interface ModeTabsProps {
  mode: ActivityMode;
  onChange: (mode: ActivityMode) => void;
}

export function ModeTabs({ mode, onChange }: ModeTabsProps) {
  const activeIndex = ACTIVITY_MODES.findIndex((option) => option.id === mode);

  return (
    <div
      className="mode-tabs"
      role="group"
      aria-label="選擇外出模式"
      data-active-index={activeIndex}
    >
      <span className="mode-tab-indicator" aria-hidden="true" />
      {ACTIVITY_MODES.map((option) => (
        <button
          className="mode-tab"
          data-active={mode === option.id}
          type="button"
          key={option.id}
          aria-pressed={mode === option.id}
          onClick={() => onChange(option.id)}
        >
          <AppIcon name={MODE_ICONS[option.id]} />
          {option.label}
        </button>
      ))}
    </div>
  );
}
