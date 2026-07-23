export type RawProviderModelItem =
  | string
  | {
      id?: string;
      name?: string;
      model?: string;
      slug?: string;
      sub_type?: string;
      subType?: string;
      type?: string;
      category?: string;
    };

interface ProviderPayload {
  data?: unknown;
  models?: unknown;
  items?: unknown;
  result?: unknown;
}

interface FetchProviderModelsOptions<T> {
  urls: string[];
  apiKey: string;
  transformItems?: (items: T[]) => T[];
  includeNestedResult?: boolean;
}

export interface ProviderModelFetchResult<T> {
  items: T[];
  warnings: string[];
}

function buildProviderErrorMessage(status: number, statusText: string, rawBody: string): string {
  try {
    const parsed = rawBody ? (JSON.parse(rawBody) as unknown) : null;
    const message = extractErrorMessage(parsed);
    if (message) return message;
  } catch {
    // Fall through to the raw response or HTTP status.
  }

  const fallbackRaw = rawBody.trim();
  return fallbackRaw ? fallbackRaw.slice(0, 500) : `HTTP ${status}: ${statusText}`;
}

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidate = payload as {
    error?: { message?: string } | string;
    message?: string;
  };
  if (typeof candidate.error === "object") return candidate.error?.message?.trim() || "";
  if (typeof candidate.error === "string") return candidate.error.trim();
  return typeof candidate.message === "string" ? candidate.message.trim() : "";
}

function extractProviderModelItems<T>(payload: unknown, includeNestedResult = false): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== "object") return [];

  const candidate = payload as ProviderPayload;
  const direct = [candidate.data, candidate.models, candidate.items, candidate.result];
  const nested = includeNestedResult ? extractNestedResultArrays(candidate.result) : [];
  return [...direct, ...nested].flatMap((value) => (Array.isArray(value) ? (value as T[]) : []));
}

function extractNestedResultArrays(result: unknown): unknown[] {
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  const nested = result as ProviderPayload;
  return [nested.data, nested.models, nested.items];
}

export async function fetchProviderModelItems<T>({
  urls,
  apiKey,
  transformItems = (items) => items,
  includeNestedResult = false,
}: FetchProviderModelsOptions<T>): Promise<ProviderModelFetchResult<T>> {
  const items: T[] = [];
  const warnings: string[] = [];
  const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  for (const url of urls) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      warnings.push(await readProviderError(response));
      continue;
    }

    const payload = await response.json().catch(() => null);
    items.push(...transformItems(extractProviderModelItems<T>(payload, includeNestedResult)));
  }

  return { items, warnings };
}

async function readProviderError(response: Response): Promise<string> {
  const rawBody = await response.text().catch(() => "");
  return buildProviderErrorMessage(response.status, response.statusText, rawBody);
}

export function buildPresetModels(ids: string[]) {
  return ids.map((id) => ({ id, name: id }));
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
