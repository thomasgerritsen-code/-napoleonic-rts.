'use strict';
// Cooperative background work. Physics, combat and input remain synchronous.
(function installFrameWork(root) {
  const jobs = new Map(), stats = { completed: 0, failed: 0, maxWaitMs: 0 };
  function enqueue(key, run, options = {}) {
    const old = jobs.get(key), now = performance.now();
    jobs.set(key, { key, run, queuedAt: old?.queuedAt ?? now,
      due: old?.due ?? now + (options.maxDelayMs ?? 120), priority: options.priority ?? 0 });
  }
  function flush(frameStartedAt) {
    const now = performance.now();
    const next = [...jobs.values()].sort((a,b) => a.due - b.due || b.priority - a.priority)[0];
    if (!next || (now - frameStartedAt >= 12 && now < next.due)) return;
    jobs.delete(next.key);
    stats.maxWaitMs = Math.max(stats.maxWaitMs, now - next.queuedAt);
    try {
      const result = next.run(); stats.completed++;
      if (result?.catch) result.catch(error => { stats.failed++; console.error('[frame-work]', error); });
    } catch (error) { stats.failed++; console.error('[frame-work]', error); }
    // At most one indivisible job per frame; never drain a backlog all at once.
  }
  root.__FRAME_WORK_V1__ = Object.freeze({ enqueue, flush, cancel: key => jobs.delete(key),
    stats: () => ({ ...stats, pending: jobs.size, keys: [...jobs.keys()] }) });
  root.NRTS.events.on('game:reset', () => { jobs.delete('ai:develop'); jobs.delete('ai:orders'); });
})(window);
