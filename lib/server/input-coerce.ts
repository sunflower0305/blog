// 请求体字段收窄工具：把客户端传入的 unknown 清洗成可安全落库的值。
// 约定与 app/api/posts/route.ts 里已有的手写归一化保持一致（不引入 schema 库）：
// 校验失败时倾向于“清洗成安全值”，而不是抛错。
//
// 用于「部分更新」路径（updatePost 以 `!== undefined` 判断是否改动该列）时，
// 必须用 whenDefined / asOptionalEnum 保留 undefined —— 省略的字段要保持省略，
// 不能被收窄成 0 / [] 而误改数据库。

/** 收窄为 SQLite 位值（0 | 1）。仅 1 / true 记为 1，其余一律 0。 */
export function asBit(value: unknown): 0 | 1 {
  return value === 1 || value === true ? 1 : 0;
}

/** 收窄为去重前的、去空白且非空的字符串数组，最多 `max` 个。 */
export function asStringArray(value: unknown, max = 10): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

/**
 * 收窄为 `allowed` 之一；省略或非法都返回 undefined。
 * 适用于部分更新路径：非法值当作“未提供”丢弃，不覆盖已有列。
 */
export function asOptionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : undefined;
}

/**
 * 仅当字段存在（非 undefined）时才应用 `coerce`，否则保持 undefined。
 * 用于把 asBit / asStringArray 等“总产出值”的收窄器套进部分更新路径。
 */
export function whenDefined<T>(value: unknown, coerce: (value: unknown) => T): T | undefined {
  return value === undefined ? undefined : coerce(value);
}
