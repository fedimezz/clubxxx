// lib/concurrency.ts — run async jobs with a fixed number in flight.
//
// `Promise.allSettled(items.map(job))` starts EVERY job at once: a 500-member e-mail/SMS announcement
// opened 500 simultaneous connections, tripped the provider's rate limit and held the request open.
// This keeps at most `limit` running. Never rejects: every job's outcome is returned in input order.

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "fulfilled", value: await worker(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(runners);
  return results;
}
