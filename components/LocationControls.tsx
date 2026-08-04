import type { ReactNode, Ref } from "react";
import {
  DISTRICTS,
  HONG_KONG_WIDE,
  type LocationId,
} from "@/lib/location/districts";
import { AppIcon } from "@/components/AppIcon";

export type LocationUiStatus =
  | "locating"
  | "located"
  | "manual"
  | "denied"
  | "unsupported"
  | "timeout"
  | "unavailable";

export type PickerPhase = "closed" | "opening" | "open" | "closing";

const LOCATION_MESSAGES: Record<LocationUiStatus, string> = {
  locating: "正在取得你所在的地區；精確位置不會儲存或傳送。",
  located: "已按裝置位置選擇最近地區；你可隨時改選。",
  manual: "已使用你選擇的地區；只會在目前頁面保留。",
  denied: "位置權限已被拒絕，現先顯示香港整體資料。",
  unsupported: "此瀏覽器未能提供位置，現先顯示香港整體資料。",
  timeout: "定位等候逾時，現先顯示香港整體資料。",
  unavailable: "暫時無法定位，現先顯示香港整體資料。",
};

const LOCATION_STATUS_LABELS: Record<LocationUiStatus, string> = {
  locating: "正在定位…",
  located: "已使用定位",
  manual: "已選擇地區",
  denied: "定位被拒絕",
  unsupported: "未能使用定位",
  timeout: "定位逾時",
  unavailable: "定位暫不可用",
};

interface LocationControlsProps {
  locationLabel: string;
  modeLabel: string;
  locationNote: string;
  status: LocationUiStatus;
  pickerPhase: PickerPhase;
  onTogglePicker: () => void;
  updateLabel?: string;
  triggerRef?: Ref<HTMLButtonElement>;
  panelRef?: Ref<HTMLElement>;
  children?: ReactNode;
}

export function LocationControls({
  locationLabel,
  modeLabel,
  locationNote,
  status,
  pickerPhase,
  onTogglePicker,
  updateLabel = "等待更新",
  triggerRef,
  panelRef,
  children,
}: LocationControlsProps) {
  const pickerMounted = pickerPhase !== "closed";
  const pickerExpanded = pickerPhase === "opening" || pickerPhase === "open";

  return (
    <section
      ref={panelRef}
      className="location-panel"
      role={pickerMounted ? "dialog" : undefined}
      aria-modal={pickerMounted ? true : undefined}
      aria-labelledby={
        pickerMounted ? "location-dialog-title" : "location-heading"
      }
      data-open={pickerMounted}
      data-phase={pickerPhase}
    >
      {pickerMounted ? (
        <h2 className="sr-only" id="location-dialog-title">
          地區及活動選擇
        </h2>
      ) : null}
      <button
        ref={triggerRef}
        className="location-pill"
        type="button"
        aria-expanded={pickerExpanded}
        aria-controls="quick-controls"
        onClick={onTogglePicker}
      >
        <span className="location-primary">
          <span className="location-icon"><AppIcon name="location" /></span>
          <span className="location-name" id="location-heading">{locationLabel}</span>
          <span className="control-separator" aria-hidden="true">·</span>
          <span className="control-mode">{modeLabel}</span>
        </span>
        <span className="location-action" aria-hidden="true">
          <AppIcon name="chevron" />
        </span>
      </button>
      <p className="location-detail" role="status">
        <span>{LOCATION_STATUS_LABELS[status]}</span>
        <span>{updateLabel}</span>
        <span>{LOCATION_MESSAGES[status]}</span>
        <span>{locationNote}</span>
      </p>
      {children}
    </section>
  );
}

interface DistrictPickerProps {
  locationId: LocationId;
  onSelect: (locationId: LocationId) => void;
}

export function DistrictPicker({ locationId, onSelect }: DistrictPickerProps) {
  return (
    <section className="district-picker" id="district-picker" aria-labelledby="district-picker-heading">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">毋須輸入地址</p>
          <h2 id="district-picker-heading">一按選擇地區</h2>
        </div>
      </div>
      <button
        type="button"
        className="district-button district-button-wide"
        aria-pressed={locationId === HONG_KONG_WIDE.id}
        onClick={() => onSelect(HONG_KONG_WIDE.id)}
      >
        香港整體
        <span>非地區化結果</span>
      </button>
      <div className="district-grid">
        {DISTRICTS.map((district) => (
          <button
            type="button"
            className="district-button"
            key={district.id}
            aria-pressed={locationId === district.id}
            onClick={() => onSelect(district.id)}
          >
            {district.nameTc}
          </button>
        ))}
      </div>
    </section>
  );
}
