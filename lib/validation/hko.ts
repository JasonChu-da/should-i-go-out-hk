import {
  failure,
  isFiniteNumber,
  isRecord,
  issue,
  optionalFiniteNumber,
  optionalString,
  parseStringArray,
  success,
  type ParseResult,
  type ValidationIssue,
} from "./common";

export interface HkoRainfallItem {
  place: string;
  unit?: string;
  max?: number;
  min?: number;
  main?: string;
}

export interface HkoMeasurementItem {
  place: string;
  value: number;
  unit?: string;
}

export interface HkoUvItem {
  value: number;
  place?: string;
  desc?: string;
  message?: string;
}

export interface HkoRainfall {
  data: HkoRainfallItem[];
  startTime?: string;
  endTime?: string;
}

export interface HkoMeasurements {
  data: HkoMeasurementItem[];
  recordTime?: string;
}

export interface HkoUvIndex {
  data: HkoUvItem[];
  recordTime?: string;
  recordDesc?: string;
}

export interface HkoRhrread {
  rainfall?: HkoRainfall;
  temperature?: HkoMeasurements;
  humidity?: HkoMeasurements;
  uvindex?: "" | HkoUvIndex;
  warningMessage?: "" | string[];
  specialWxTips?: string[];
  rainstormReminder?: string;
  icon?: number[];
  iconUpdateTime?: string;
  updateTime?: string;
}

export interface HkoWarningItem {
  name: string;
  code: string;
  actionCode: string;
  type?: string;
  issueTime?: string;
  updateTime?: string;
  expireTime?: string;
}

export type HkoWarningSummary = Record<string, HkoWarningItem>;

export interface HkoLocalForecast {
  generalSituation?: string;
  tcInfo?: string;
  fireDangerWarning?: string;
  forecastPeriod?: string;
  forecastDesc?: string;
  outlook?: string;
  updateTime?: string;
}

function parseRainfallItem(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): HkoRainfallItem | undefined {
  if (!isRecord(value)) {
    issue(issues, path, "預期為雨量物件，已排除此項");
    return undefined;
  }

  if (typeof value.place !== "string") {
    issue(issues, `${path}.place`, "預期為字串，已排除此項");
    return undefined;
  }

  const max = optionalFiniteNumber(value, "max", path, issues);
  const min = optionalFiniteNumber(value, "min", path, issues);
  if (max === undefined && min === undefined) {
    issue(issues, path, "雨量項目缺少有效的 max 或 min，已排除此項");
    return undefined;
  }

  const unit = optionalString(value, "unit", path, issues);
  const main = optionalString(value, "main", path, issues);
  return {
    place: value.place,
    ...(unit !== undefined ? { unit } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(main !== undefined ? { main } : {}),
  };
}

function parseMeasurementItem(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): HkoMeasurementItem | undefined {
  if (!isRecord(value)) {
    issue(issues, path, "預期為觀測物件，已排除此項");
    return undefined;
  }

  if (typeof value.place !== "string") {
    issue(issues, `${path}.place`, "預期為字串，已排除此項");
    return undefined;
  }

  if (!isFiniteNumber(value.value)) {
    issue(issues, `${path}.value`, "預期為有限數字，已排除此項");
    return undefined;
  }

  const unit = optionalString(value, "unit", path, issues);
  return {
    place: value.place,
    value: value.value,
    ...(unit !== undefined ? { unit } : {}),
  };
}

function parseUvItem(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): HkoUvItem | undefined {
  if (!isRecord(value)) {
    issue(issues, path, "預期為紫外線指數物件，已排除此項");
    return undefined;
  }

  if (!isFiniteNumber(value.value)) {
    issue(issues, `${path}.value`, "預期為有限數字，已排除此項");
    return undefined;
  }

  const place = optionalString(value, "place", path, issues);
  const desc = optionalString(value, "desc", path, issues);
  const message = optionalString(value, "message", path, issues);
  return {
    value: value.value,
    ...(place !== undefined ? { place } : {}),
    ...(desc !== undefined ? { desc } : {}),
    ...(message !== undefined ? { message } : {}),
  };
}

function parseDataArray<T>(
  source: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
  parseItem: (
    value: unknown,
    itemPath: string,
    itemIssues: ValidationIssue[],
  ) => T | undefined,
): T[] {
  if (!Array.isArray(source.data)) {
    issue(issues, `${path}.data`, "預期為陣列");
    return [];
  }

  const data: T[] = [];
  source.data.forEach((item, index) => {
    const parsed = parseItem(item, `${path}.data[${index}]`, issues);
    if (parsed !== undefined) {
      data.push(parsed);
    }
  });
  return data;
}

function parseRainfall(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): HkoRainfall | undefined {
  if (!isRecord(value)) {
    issue(issues, path, "預期為雨量物件");
    return undefined;
  }

  const data = parseDataArray(value, path, issues, parseRainfallItem);
  const startTime = optionalString(value, "startTime", path, issues);
  const endTime = optionalString(value, "endTime", path, issues);
  return {
    data,
    ...(startTime !== undefined ? { startTime } : {}),
    ...(endTime !== undefined ? { endTime } : {}),
  };
}

function parseMeasurements(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): HkoMeasurements | undefined {
  if (!isRecord(value)) {
    issue(issues, path, "預期為觀測物件");
    return undefined;
  }

  const data = parseDataArray(value, path, issues, parseMeasurementItem);
  const recordTime = optionalString(value, "recordTime", path, issues);
  return {
    data,
    ...(recordTime !== undefined ? { recordTime } : {}),
  };
}

function parseUvIndex(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): "" | HkoUvIndex | undefined {
  if (value === "") {
    return "";
  }

  if (!isRecord(value)) {
    issue(issues, path, "預期為空字串或紫外線指數物件");
    return undefined;
  }

  const data = parseDataArray(value, path, issues, parseUvItem);
  const recordTime = optionalString(value, "recordTime", path, issues);
  const recordDesc = optionalString(value, "recordDesc", path, issues);
  return {
    data,
    ...(recordTime !== undefined ? { recordTime } : {}),
    ...(recordDesc !== undefined ? { recordDesc } : {}),
  };
}

function parseWarningMessage(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): "" | string[] | undefined {
  if (value === "") {
    return "";
  }
  return parseStringArray(value, path, issues);
}

function parseIcon(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): number[] | undefined {
  if (!Array.isArray(value)) {
    issue(issues, path, "預期為數字陣列");
    return undefined;
  }

  const icons: number[] = [];
  value.forEach((item, index) => {
    if (isFiniteNumber(item)) {
      icons.push(item);
    } else {
      issue(issues, `${path}[${index}]`, "預期為有限數字，已排除此項");
    }
  });
  return icons;
}

export function parseRhrread(input: unknown): ParseResult<HkoRhrread> {
  if (!isRecord(input)) {
    return failure("$", "rhrread 根節點必須是物件");
  }

  const issues: ValidationIssue[] = [];
  const value: HkoRhrread = {};

  if ("rainfall" in input) {
    const rainfall = parseRainfall(input.rainfall, "$.rainfall", issues);
    if (rainfall !== undefined) {
      value.rainfall = rainfall;
    }
  }
  if ("temperature" in input) {
    const temperature = parseMeasurements(
      input.temperature,
      "$.temperature",
      issues,
    );
    if (temperature !== undefined) {
      value.temperature = temperature;
    }
  }
  if ("humidity" in input) {
    const humidity = parseMeasurements(input.humidity, "$.humidity", issues);
    if (humidity !== undefined) {
      value.humidity = humidity;
    }
  }
  if ("uvindex" in input) {
    const uvindex = parseUvIndex(input.uvindex, "$.uvindex", issues);
    if (uvindex !== undefined) {
      value.uvindex = uvindex;
    }
  }
  if ("warningMessage" in input) {
    const warningMessage = parseWarningMessage(
      input.warningMessage,
      "$.warningMessage",
      issues,
    );
    if (warningMessage !== undefined) {
      value.warningMessage = warningMessage;
    }
  }
  if ("specialWxTips" in input) {
    const specialWxTips = parseStringArray(
      input.specialWxTips,
      "$.specialWxTips",
      issues,
    );
    if (specialWxTips !== undefined) {
      value.specialWxTips = specialWxTips;
    }
  }
  if ("icon" in input) {
    const icon = parseIcon(input.icon, "$.icon", issues);
    if (icon !== undefined) {
      value.icon = icon;
    }
  }

  const rainstormReminder = optionalString(
    input,
    "rainstormReminder",
    "$",
    issues,
  );
  if (rainstormReminder !== undefined) {
    value.rainstormReminder = rainstormReminder;
  }
  const iconUpdateTime = optionalString(
    input,
    "iconUpdateTime",
    "$",
    issues,
  );
  if (iconUpdateTime !== undefined) {
    value.iconUpdateTime = iconUpdateTime;
  }
  const updateTime = optionalString(input, "updateTime", "$", issues);
  if (updateTime !== undefined) {
    value.updateTime = updateTime;
  }

  return success(value, issues);
}

function parseWarningItem(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): HkoWarningItem | undefined {
  if (!isRecord(value)) {
    issue(issues, path, "預期為警告物件，已排除此項", "item");
    return undefined;
  }

  const requiredKeys = ["name", "code", "actionCode"] as const;
  for (const key of requiredKeys) {
    if (typeof value[key] !== "string") {
      issue(issues, `${path}.${key}`, "預期為字串，已排除此項", "item");
      return undefined;
    }
  }

  const type = optionalString(value, "type", path, issues);
  const issueTime = optionalString(value, "issueTime", path, issues);
  const updateTime = optionalString(value, "updateTime", path, issues);
  const expireTime = optionalString(value, "expireTime", path, issues);

  return {
    name: value.name as string,
    code: value.code as string,
    actionCode: value.actionCode as string,
    ...(type !== undefined ? { type } : {}),
    ...(issueTime !== undefined ? { issueTime } : {}),
    ...(updateTime !== undefined ? { updateTime } : {}),
    ...(expireTime !== undefined ? { expireTime } : {}),
  };
}

export function parseWarnsum(input: unknown): ParseResult<HkoWarningSummary> {
  if (!isRecord(input)) {
    return failure("$", "warnsum 根節點必須是物件");
  }

  const issues: ValidationIssue[] = [];
  const warnings: HkoWarningSummary = {};
  for (const [key, rawItem] of Object.entries(input)) {
    const warning = parseWarningItem(rawItem, `$.${key}`, issues);
    if (warning !== undefined) {
      warnings[key] = warning;
    }
  }

  return success(warnings, issues);
}

const FORECAST_STRING_FIELDS = [
  "generalSituation",
  "tcInfo",
  "fireDangerWarning",
  "forecastPeriod",
  "forecastDesc",
  "outlook",
  "updateTime",
] as const satisfies readonly (keyof HkoLocalForecast)[];

export function parseFlw(input: unknown): ParseResult<HkoLocalForecast> {
  if (!isRecord(input)) {
    return failure("$", "flw 根節點必須是物件");
  }

  const issues: ValidationIssue[] = [];
  const forecast: HkoLocalForecast = {};
  for (const field of FORECAST_STRING_FIELDS) {
    const value = optionalString(input, field, "$", issues);
    if (value !== undefined) {
      forecast[field] = value;
    }
  }

  return success(forecast, issues);
}
