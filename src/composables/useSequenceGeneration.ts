import { ref, nextTick } from 'vue';
import { splitmix32 } from '../core/sequence.mjs';

interface WorkerProgressMessage {
  type: 'progress';
  requestId: number;
  added: number[];
  currentNumber: number;
  probability: number;
  combinations: number;
  skipped: number;
  truncatedAdds: number;
}

interface WorkerDoneMessage {
  type: 'done';
  requestId: number;
  stopped: boolean;
  sequence: number[];
  currentNumber: number;
  probability: number;
  probabilitySum: number;
  combinations: number;
  skipped: number;
  truncatedAdds: number;
}

type WorkerOutgoingMessage = WorkerProgressMessage | WorkerDoneMessage | { type: 'error'; requestId: number; message: string };

export function useSequenceGeneration(
  myListOfSimple: any,
  currentNumber: any,
  currentProbability: any,
  logs: any,
  initialValue: number[],
  isGenerating: any,
  seed: any,
  tolerance: any,
  stats: { combinations: any; skipped: any; truncatedAdds: any }
) {
  const result = ref<[number, number][][]>([]);
  const generationStartTime = ref<number>(0);
  const generationTime = ref<number>(0);
  const generationProgress = ref<number>(0);
  const progressMode = ref<string>('single');
  const progressCurrent = ref<number>(0);
  const progressTotal = ref<number>(0);
  const stopRequested = ref(false);

  let worker: Worker | null = null;
  let workerBroken = false;
  let lastRequestId = 0;
  let activeJob: { id: number; resolve: (done: WorkerDoneMessage | null) => void } | null = null;
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  const WORKER_WATCHDOG_MS = 15000;

  function myLog(...args: any[]) {
    if (logs.value) {
      console.log(...args);
    }
  }

  function clearWatchdog() {
    if (watchdogTimer !== null) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  }

  function armWatchdog(requestId: number) {
    clearWatchdog();
    watchdogTimer = setTimeout(() => {
      if (!activeJob || activeJob.id !== requestId) return;
      myLog('generation worker not responding, switching to fallback');
      workerBroken = true;
      try {
        worker?.terminate();
      } catch {
        worker = null;
      }
      worker = null;
      failActiveJob();
    }, WORKER_WATCHDOG_MS);
  }

  function ensureWorker(): Worker | null {
    if (worker) return worker;
    if (workerBroken) return null;
    try {
      worker = new Worker(new URL('../workers/generation.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => handleWorkerMessage(event.data);
      worker.onerror = () => {
        workerBroken = true;
        failActiveJob();
      };
      return worker;
    } catch {
      workerBroken = true;
      return null;
    }
  }

  function failActiveJob() {
    clearWatchdog();
    if (!activeJob) return;
    const { resolve } = activeJob;
    activeJob = null;
    resolve(null);
  }

  function handleWorkerMessage(message: WorkerOutgoingMessage) {
    const job = activeJob;
    if (!job || message.requestId !== job.id) return;
    if (message.type === 'progress') {
      applyProgress(message);
      armWatchdog(job.id);
    } else if (message.type === 'done') {
      clearWatchdog();
      activeJob = null;
      job.resolve(message);
    } else if (message.type === 'error') {
      myLog('generation worker error:', message.message);
      clearWatchdog();
      workerBroken = true;
      failActiveJob();
    }
  }

  function applyProgress(message: WorkerProgressMessage) {
    if (message.added.length > 0) {
      myListOfSimple.value = [...myListOfSimple.value, ...message.added];
    }
    currentNumber.value = message.currentNumber;
    currentProbability.value = message.probability;
    stats.combinations.value = message.combinations;
    stats.skipped.value = message.skipped;
    stats.truncatedAdds.value = message.truncatedAdds;
    const total = progressTotal.value;
    if (total > 0) {
      progressCurrent.value = Math.min(total, myListOfSimple.value.length - initialValue.length);
      generationProgress.value = Math.min(99, (progressCurrent.value / total) * 100);
    }
  }

  function postJob(count: number, seedValue: number, trackProgress: boolean): Promise<WorkerDoneMessage | null> {
    return new Promise((resolve) => {
      const instance = ensureWorker();
      if (!instance) {
        resolve(null);
        return;
      }
      if (activeJob) failActiveJob();
      const id = ++lastRequestId;
      activeJob = { id, resolve };
      progressTotal.value = trackProgress ? Math.max(1, count - initialValue.length) : 0;
      armWatchdog(id);
      instance.postMessage({
        type: 'start',
        requestId: id,
        count,
        seed: seedValue,
        tolerance: Number(tolerance.value),
        initial: initialValue
      });
    });
  }

  function finalizeRun(done: WorkerDoneMessage, trackProgress: boolean) {
    myListOfSimple.value = done.sequence;
    currentNumber.value = done.currentNumber;
    currentProbability.value = done.probability;
    stats.combinations.value = done.combinations;
    stats.skipped.value = done.skipped;
    stats.truncatedAdds.value = done.truncatedAdds;
    if (trackProgress) {
      progressCurrent.value = progressTotal.value;
      if (!done.stopped) {
        generationProgress.value = 100;
      }
    }
    result.value.push(done.sequence.map((v, i) => [v, i] as [number, number]));
    myLog('generation done', { count: done.sequence.length, stopped: done.stopped, probability: done.probability });
  }

  async function runWithWorker(count: number, seedValue: number, trackProgress: boolean): Promise<boolean> {
    const done = await postJob(count, seedValue, trackProgress);
    if (!done) return false;
    finalizeRun(done, trackProgress);
    return true;
  }

  async function runFallback(count: number, seedValue: number) {
    const random = splitmix32(seedValue);
    const sequence = [...initialValue];
    let current = initialValue[initialValue.length - 1] + 1;
    const total = Math.max(1, count - sequence.length);
    const chunkSize = Math.max(1, Math.ceil(total / Math.min(total, 25)));
    let generated = 0;

    while (generated < total && !stopRequested.value) {
      const chunkStart = Date.now();
      let chunkNumbers = 0;
      while (generated < total && chunkNumbers < chunkSize && Date.now() - chunkStart < 32) {
        const gap = Math.max(1, Math.round(-Math.log(1 - random()) * Math.log(current)));
        current += gap;
        sequence.push(current);
        generated++;
        chunkNumbers++;
      }
      myListOfSimple.value = sequence.slice();
      currentProbability.value = 1 / Math.log(current);
      progressCurrent.value = generated;
      generationProgress.value = Math.min(99, (generated / total) * 100);
      await nextTick();
      await new Promise(resolve => setTimeout(resolve, 16));
    }

    myListOfSimple.value = sequence;
    currentNumber.value = current;
    result.value.push(sequence.map((v, i) => [v, i] as [number, number]));
  }

  function normalizedSeed(value?: number): number {
    const raw = value === undefined ? Number(seed.value) : value;
    return Number.isFinite(raw) ? Math.floor(raw) >>> 0 : 0;
  }

  async function getList(maxSimples: number, showChart: any) {
    if (isGenerating.value) return;

    const count = Math.max(initialValue.length + 1, Math.floor(maxSimples));
    const seedValue = normalizedSeed();

    stopRequested.value = false;
    showChart.value = false;

    generationStartTime.value = Date.now();
    generationTime.value = 0;

    myListOfSimple.value = [...initialValue];
    currentNumber.value = initialValue[initialValue.length - 1] + 1;

    progressMode.value = 'single';
    progressCurrent.value = 0;
    progressTotal.value = Math.max(1, count - initialValue.length);
    isGenerating.value = true;
    generationProgress.value = 0;

    const done = await runWithWorker(count, seedValue, true);
    if (!done) {
      await runFallback(count, seedValue);
    }

    isGenerating.value = false;
    generationTime.value = (Date.now() - generationStartTime.value) / 1000;
  }

  async function getListFast(maxSimples: number, showChart: any, seedValue?: number) {
    const count = Math.max(initialValue.length + 1, Math.floor(maxSimples));
    const effectiveSeed = normalizedSeed(seedValue);

    stopRequested.value = false;
    showChart.value = false;

    generationStartTime.value = Date.now();
    generationTime.value = 0;

    myListOfSimple.value = [...initialValue];
    currentNumber.value = initialValue[initialValue.length - 1] + 1;

    const done = await runWithWorker(count, effectiveSeed, false);
    if (!done) {
      await runFallback(count, effectiveSeed);
    }
  }

  function stopGeneration() {
    stopRequested.value = true;
    worker?.postMessage({ type: 'stop' });
  }

  function dispose() {
    stopRequested.value = false;
    activeJob = null;
    clearWatchdog();
    worker?.terminate();
    worker = null;
  }

  return {
    result,
    generationStartTime,
    generationTime,
    generationProgress,
    isGenerating,
    progressMode,
    progressCurrent,
    progressTotal,
    stopRequested,
    stopGeneration,
    dispose,
    getList,
    getListFast
  };
}
