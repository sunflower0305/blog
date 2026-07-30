export function formatComplexitySummary(count, threshold) {
  return `Oxlint found ${count} functions above the configured complexity threshold of ${threshold}.`;
}

export function extractComplexityThreshold(diagnostics, fallback) {
  for (const diagnostic of diagnostics) {
    const threshold = Number.parseInt(
      diagnostic.message?.match(/Maximum allowed is (\d+)/)?.[1] ?? "",
      10,
    );
    if (Number.isFinite(threshold)) return threshold;
  }
  return fallback;
}
