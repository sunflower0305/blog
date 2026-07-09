async function getVinextCloudflareEnv() {
  try {
    const workers = await import('cloudflare:workers') as { env?: CloudflareEnv }
    return workers.env
  } catch {
    return undefined
  }
}

export async function getAppCloudflareContext() {
  const vinextEnv = await getVinextCloudflareEnv()
  return {
    env: vinextEnv,
    ctx: undefined,
    cf: undefined,
  }
}

export async function getAppCloudflareEnv() {
  return (await getAppCloudflareContext()).env
}
