export interface ValidationIssue {
  path: string;
  message: string;
  /** Whether validation discarded a whole collection item or only one field. */
  impact?: "field" | "item";
}

export type ParseSuccess<T> = {
  ok: true;
  value: T;
  issues: ValidationIssue[];
};

export type ParseFailure = {
  ok: false;
  issues: ValidationIssue[];
};

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function issue(
  issues: ValidationIssue[],
  path: string,
  message: string,
  impact?: ValidationIssue["impact"],
): void {
  issues.push(impact ? { path, message, impact } : { path, message });
}

export function success<T>(
  value: T,
  issues: ValidationIssue[] = [],
): ParseSuccess<T> {
  return { ok: true, value, issues };
}

export function failure(
  path: string,
  message: string,
  issues: ValidationIssue[] = [],
): ParseFailure {
  return {
    ok: false,
    issues: [...issues, { path, message }],
  };
}

/**
 * Reads an optional string without coercion. An absent key is valid; a key
 * with the wrong type is omitted and reported so one bad optional field does
 * not discard an otherwise useful record.
 */
export function optionalString(
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  if (!(key in source)) {
    return undefined;
  }

  const value = source[key];
  if (typeof value === "string") {
    return value;
  }

  issue(issues, `${path}.${key}`, "預期為字串");
  return undefined;
}

export function optionalFiniteNumber(
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): number | undefined {
  if (!(key in source)) {
    return undefined;
  }

  const value = source[key];
  if (isFiniteNumber(value)) {
    return value;
  }

  issue(issues, `${path}.${key}`, "預期為有限數字");
  return undefined;
}

export function parseStringArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string[] | undefined {
  if (!Array.isArray(value)) {
    issue(issues, path, "預期為字串陣列");
    return undefined;
  }

  const strings: string[] = [];
  value.forEach((item, index) => {
    if (typeof item === "string") {
      strings.push(item);
    } else {
      issue(issues, `${path}[${index}]`, "預期為字串，已排除此項");
    }
  });
  return strings;
}
