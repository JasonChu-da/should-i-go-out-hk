import type { WeatherPeriod } from "@/lib/weather-scene/types";

const HONG_KONG_LATITUDE = 22.3027;
const HONG_KONG_LONGITUDE = 114.1772;
const DAY_END_LEAD_MINUTES = 45;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function localCalendarDate(date: Date): [number, number, number] | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const result: [number, number, number] = [
    value("year"),
    value("month"),
    value("day"),
  ];
  return result.every(Number.isFinite) ? result : null;
}

function solarEvent(
  year: number,
  month: number,
  day: number,
  zenithDegrees: number,
): { sunrise: number; sunset: number } | null {
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  const yearStart = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((localMidnightAsUtc - yearStart) / 86_400_000) + 1;
  const gamma = (2 * Math.PI * (dayOfYear - 1)) / 365;
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const latitude = radians(HONG_KONG_LATITUDE);
  const hourAngleCosine =
    Math.cos(radians(zenithDegrees)) / (Math.cos(latitude) * Math.cos(declination)) -
    Math.tan(latitude) * Math.tan(declination);
  if (hourAngleCosine < -1 || hourAngleCosine > 1) return null;
  const hourAngle = (Math.acos(hourAngleCosine) * 180) / Math.PI;
  const solarNoonMinutes = 720 - 4 * HONG_KONG_LONGITUDE - equationOfTime;
  return {
    sunrise: localMidnightAsUtc + (solarNoonMinutes - 4 * hourAngle) * 60_000,
    sunset: localMidnightAsUtc + (solarNoonMinutes + 4 * hourAngle) * 60_000,
  };
}

export interface HongKongSolarTimes {
  sunrise: Date;
  sunset: Date;
  civilDusk: Date;
}

export function getHongKongSolarTimes(date: Date): HongKongSolarTimes | null {
  if (!Number.isFinite(date.getTime())) return null;
  const calendarDate = localCalendarDate(date);
  if (calendarDate === null) return null;
  const sun = solarEvent(...calendarDate, 90.833);
  const civil = solarEvent(...calendarDate, 96);
  if (sun === null || civil === null) return null;
  return {
    sunrise: new Date(sun.sunrise),
    sunset: new Date(sun.sunset),
    civilDusk: new Date(civil.sunset),
  };
}

export function hongKongWeatherPeriod(timestamp: string): WeatherPeriod | null {
  const date = new Date(timestamp);
  const times = getHongKongSolarTimes(date);
  if (times === null) return null;
  const instant = date.getTime();
  const duskStarts = times.sunset.getTime() - DAY_END_LEAD_MINUTES * 60_000;
  if (instant >= times.sunrise.getTime() && instant < duskStarts) return "day";
  if (instant >= duskStarts && instant <= times.civilDusk.getTime()) return "dusk";
  return "night";
}
