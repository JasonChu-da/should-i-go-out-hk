export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface DistrictRecord {
  readonly kind: "district";
  readonly id: string;
  readonly nameTc: string;
  readonly center: Coordinates;
  readonly rainfallPlace: string;
  readonly temperatureStations: readonly string[];
  readonly aqhiStation: string;
}

export interface HongKongWideRecord {
  readonly kind: "territory";
  readonly id: "hong-kong";
  readonly nameTc: "香港整體";
}

/**
 * Canonical district records. Coordinates are approximate district centres
 * used only for an in-memory nearest-centre fallback, not precise boundaries.
 * AQHI mappings follow the EPD's official related-station table and therefore
 * intentionally exclude the three roadside monitoring stations.
 */
export const DISTRICTS = [
  {
    kind: "district",
    id: "central-and-western",
    nameTc: "中西區",
    center: { latitude: 22.2819, longitude: 114.1449 },
    rainfallPlace: "中西區",
    temperatureStations: ["香港公園", "香港天文台", "京士柏"],
    aqhiStation: "Central/Western",
  },
  {
    kind: "district",
    id: "wan-chai",
    nameTc: "灣仔",
    center: { latitude: 22.2764, longitude: 114.1758 },
    rainfallPlace: "灣仔",
    temperatureStations: ["跑馬地", "香港公園", "香港天文台"],
    aqhiStation: "Central/Western",
  },
  {
    kind: "district",
    id: "eastern",
    nameTc: "東區",
    center: { latitude: 22.2841, longitude: 114.2241 },
    rainfallPlace: "東區",
    temperatureStations: ["筲箕灣", "跑馬地", "香港天文台"],
    aqhiStation: "Eastern",
  },
  {
    kind: "district",
    id: "southern",
    nameTc: "南區",
    center: { latitude: 22.2473, longitude: 114.1588 },
    rainfallPlace: "南區",
    temperatureStations: ["黃竹坑", "赤柱", "香港公園", "香港天文台"],
    aqhiStation: "Southern",
  },
  {
    kind: "district",
    id: "yau-tsim-mong",
    nameTc: "油尖旺",
    center: { latitude: 22.3214, longitude: 114.1726 },
    rainfallPlace: "油尖旺",
    temperatureStations: ["京士柏", "香港天文台", "深水埗"],
    aqhiStation: "Sham Shui Po",
  },
  {
    kind: "district",
    id: "sham-shui-po",
    nameTc: "深水埗",
    center: { latitude: 22.3307, longitude: 114.1622 },
    rainfallPlace: "深水埗",
    temperatureStations: ["深水埗", "京士柏", "香港天文台"],
    aqhiStation: "Sham Shui Po",
  },
  {
    kind: "district",
    id: "kowloon-city",
    nameTc: "九龍城",
    center: { latitude: 22.3282, longitude: 114.1916 },
    rainfallPlace: "九龍城",
    temperatureStations: ["九龍城", "啟德跑道公園", "香港天文台"],
    aqhiStation: "Sham Shui Po",
  },
  {
    kind: "district",
    id: "wong-tai-sin",
    nameTc: "黃大仙",
    center: { latitude: 22.342, longitude: 114.1933 },
    rainfallPlace: "黃大仙",
    temperatureStations: ["黃大仙", "九龍城", "香港天文台"],
    aqhiStation: "Kwun Tong",
  },
  {
    kind: "district",
    id: "kwun-tong",
    nameTc: "觀塘",
    center: { latitude: 22.3104, longitude: 114.226 },
    rainfallPlace: "觀塘",
    temperatureStations: ["觀塘", "啟德跑道公園", "香港天文台"],
    aqhiStation: "Kwun Tong",
  },
  {
    kind: "district",
    id: "kwai-tsing",
    nameTc: "葵青",
    center: { latitude: 22.3549, longitude: 114.1261 },
    rainfallPlace: "葵青",
    temperatureStations: ["青衣", "荃灣城門谷", "香港天文台"],
    aqhiStation: "Kwai Chung",
  },
  {
    kind: "district",
    id: "tsuen-wan",
    nameTc: "荃灣",
    center: { latitude: 22.3717, longitude: 114.1136 },
    rainfallPlace: "荃灣",
    temperatureStations: ["荃灣城門谷", "荃灣可觀", "香港天文台"],
    aqhiStation: "Tsuen Wan",
  },
  {
    kind: "district",
    id: "tuen-mun",
    nameTc: "屯門",
    center: { latitude: 22.3915, longitude: 113.976 },
    rainfallPlace: "屯門",
    temperatureStations: ["屯門", "流浮山", "香港天文台"],
    aqhiStation: "Tuen Mun",
  },
  {
    kind: "district",
    id: "yuen-long",
    nameTc: "元朗",
    center: { latitude: 22.4456, longitude: 114.0222 },
    rainfallPlace: "元朗",
    temperatureStations: ["元朗公園", "流浮山", "石崗", "香港天文台"],
    aqhiStation: "Yuen Long",
  },
  {
    kind: "district",
    id: "north",
    nameTc: "北區",
    center: { latitude: 22.4947, longitude: 114.1384 },
    rainfallPlace: "北區",
    temperatureStations: ["打鼓嶺", "大埔", "香港天文台"],
    aqhiStation: "North",
  },
  {
    kind: "district",
    id: "tai-po",
    nameTc: "大埔",
    center: { latitude: 22.4508, longitude: 114.1642 },
    rainfallPlace: "大埔",
    temperatureStations: ["大埔", "大美督", "沙田", "香港天文台"],
    aqhiStation: "Tai Po",
  },
  {
    kind: "district",
    id: "sha-tin",
    nameTc: "沙田",
    center: { latitude: 22.3872, longitude: 114.1953 },
    rainfallPlace: "沙田",
    temperatureStations: ["沙田", "大埔", "香港天文台"],
    aqhiStation: "Sha Tin",
  },
  {
    kind: "district",
    id: "sai-kung",
    nameTc: "西貢",
    center: { latitude: 22.3414, longitude: 114.267 },
    rainfallPlace: "西貢",
    temperatureStations: ["西貢", "將軍澳", "香港天文台"],
    aqhiStation: "Tseung Kwan O",
  },
  {
    kind: "district",
    id: "islands",
    nameTc: "離島區",
    center: { latitude: 22.281, longitude: 113.946 },
    rainfallPlace: "離島區",
    temperatureStations: ["赤鱲角", "長洲", "香港天文台"],
    aqhiStation: "Tung Chung",
  },
] as const satisfies readonly DistrictRecord[];

export type DistrictId = (typeof DISTRICTS)[number]["id"];

export const HONG_KONG_WIDE = Object.freeze({
  kind: "territory",
  id: "hong-kong",
  nameTc: "香港整體",
} as const satisfies HongKongWideRecord);

export type LocationId = DistrictId | typeof HONG_KONG_WIDE.id;
export const LOCATIONS: readonly (DistrictRecord | HongKongWideRecord)[] = [
  HONG_KONG_WIDE,
  ...DISTRICTS,
];

const DISTRICTS_BY_ID = new Map<string, DistrictRecord>(
  DISTRICTS.map((district) => [district.id, district]),
);

// Broad service envelope only: the MVP deliberately avoids map/polygon data.
// It prevents clearly overseas coordinates from being mislabeled as a Hong
// Kong district while leaving border-area users able to choose manually.
export const HONG_KONG_SERVICE_BOUNDS = Object.freeze({
  minLatitude: 22.13,
  maxLatitude: 22.57,
  minLongitude: 113.82,
  maxLongitude: 114.5,
});

export function getDistrictById(id: string): DistrictRecord | undefined {
  return DISTRICTS_BY_ID.get(id);
}

export function isDistrictId(id: string): id is DistrictId {
  return DISTRICTS_BY_ID.has(id);
}

function areValidCoordinates(coordinates: Coordinates): boolean {
  return (
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.latitude >= -90 &&
    coordinates.latitude <= 90 &&
    coordinates.longitude >= -180 &&
    coordinates.longitude <= 180
  );
}

export function haversineDistanceKm(
  first: Coordinates,
  second: Coordinates,
): number {
  if (!areValidCoordinates(first) || !areValidCoordinates(second)) {
    return Number.NaN;
  }

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6_371.0088;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

export function getNearestDistrict(
  latitude: number,
  longitude: number,
): DistrictRecord | null {
  const currentPosition = { latitude, longitude };

  if (!areValidCoordinates(currentPosition)) {
    return null;
  }

  if (
    latitude < HONG_KONG_SERVICE_BOUNDS.minLatitude ||
    latitude > HONG_KONG_SERVICE_BOUNDS.maxLatitude ||
    longitude < HONG_KONG_SERVICE_BOUNDS.minLongitude ||
    longitude > HONG_KONG_SERVICE_BOUNDS.maxLongitude
  ) {
    return null;
  }

  let nearest: DistrictRecord = DISTRICTS[0];
  let nearestDistance = haversineDistanceKm(currentPosition, nearest.center);

  for (const district of DISTRICTS.slice(1)) {
    const distance = haversineDistanceKm(currentPosition, district.center);

    if (distance < nearestDistance) {
      nearest = district;
      nearestDistance = distance;
    }
  }

  return nearest;
}
