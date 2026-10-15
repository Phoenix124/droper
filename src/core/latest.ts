/**
 * Wraps an async producer so that, when calls overlap, only the result of the newest call is
 * delivered. Prevents a slow, older computation from overwriting a newer one.
 */
export function latestOnly<T>(produce: () => Promise<T>, deliver: (value: T) => void): () => Promise<void> {
  let generation = 0;
  return async () => {
    const mine = ++generation;
    const value = await produce();
    if (mine === generation) deliver(value);
  };
}
