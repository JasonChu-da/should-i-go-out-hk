import {
  DISTRICTS,
  HONG_KONG_WIDE,
  type LocationId,
} from "@/lib/location/districts";

export type LocationUiStatus =
  | "locating"
  | "located"
  | "manual"
  | "denied"
  | "unsupported"
  | "timeout"
  | "unavailable";

const LOCATION_MESSAGES: Record<LocationUiStatus, string> = {
  locating: "正在取得你所在的地區；精確位置不會儲存或傳送。",
  located: "已按裝置位置選擇最近地區；你可隨時改選。",
  manual: "已使用你選擇的地區；只會在目前頁面保留。",
  denied: "位置權限已被拒絕，現先顯示香港整體資料。",
  unsupported: "此瀏覽器未能提供位置，現先顯示香港整體資料。",
  timeout: "定位等候逾時，現先顯示香港整體資料。",
  unavailable: "暫時無法定位，現先顯示香港整體資料。",
};

interface LocationControlsProps {
  locationLabel: string;
  locationNote: string;
  status: LocationUiStatus;
  pickerOpen: boolean;
  onTogglePicker: () => void;
}

export function LocationControls({
  locationLabel,
  locationNote,
  status,
  pickerOpen,
  onTogglePicker,
}: LocationControlsProps) {
  return (
    <section className="location-panel" aria-labelledby="location-heading">
      <div className="location-summary">
        <div>
          <p className="eyebrow" id="location-heading">
            評估範圍
          </p>
          <p className="location-name">
            <span aria-hidden="true">◎</span> {locationLabel}
          </p>
        </div>
        <button
          className="text-button"
          type="button"
          aria-expanded={pickerOpen}
          aria-controls="district-picker"
          onClick={onTogglePicker}
        >
          {pickerOpen ? "收起地區" : "更改地區"}
        </button>
      </div>
      <p className="location-message" role="status">
        {LOCATION_MESSAGES[status]}
      </p>
      <p className="location-note">{locationNote}</p>
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
