import { describe, it, expect } from 'vitest';
import { latestOnly } from '../src/core/latest';

describe('latestOnly', () => {
  it('delivers only the newest result when calls resolve out of order', async () => {
    const delivered: string[] = [];
    const resolvers: Array<(v: string) => void> = [];
    const run = latestOnly(() => new Promise<string>((r) => resolvers.push(r)), (v) => delivered.push(v));
    const first = run();
    const second = run();
    resolvers[1]('new');
    await second;
    resolvers[0]('old');
    await first;
    expect(delivered).toEqual(['new']);
  });
});
