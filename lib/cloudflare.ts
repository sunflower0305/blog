async function getVinextCloudflareEnv() {
  try {
    const workers = (await import("cloudflare:workers")) as unknown as { env?: CloudflareEnv };
    return workers.env;
  } catch {
    return undefined;
  }
}

export interface AppExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export async function getAppCloudflareContext(): Promise<{
  env: CloudflareEnv | undefined;
  ctx: AppExecutionContext | undefined;
  cf: unknown;
}> {
  const vinextEnv = await getVinextCloudflareEnv();
  return {
    env: vinextEnv,
    ctx: undefined,
    cf: undefined,
  };
}

export async function getAppCloudflareEnv() {
  return (await getAppCloudflareContext()).env;
}
