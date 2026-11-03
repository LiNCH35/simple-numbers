import { createGenerator } from '../core/sequence.mjs';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

interface StartMessage {
  type: 'start';
  requestId: number;
  count: number;
  seed: number;
  tolerance: number;
  initial: number[];
}

interface StopMessage {
  type: 'stop';
}

type IncomingMessage = StartMessage | StopMessage;

let activeRequestId = -1;
let stopRequested = false;

const sleep = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function runJob(message: StartMessage) {
  const { requestId, count, seed, tolerance, initial } = message;
  activeRequestId = requestId;
  stopRequested = false;

  try {
    const generator = createGenerator({
      seed,
      tolerance,
      initial,
      mode: 'jump',
      trackProbability: true
    });

    const initialLength = initial.length;
    const chunkSize = Math.max(1, Math.ceil((count - initialLength) / 20));
    let reportedLength = initialLength;
    let truncatedTotal = 0;
    let last = generator.generate(initialLength);

    while (last.sequence.length < count) {
      if (stopRequested || activeRequestId !== requestId) break;
      const target = Math.min(count, last.sequence.length + chunkSize);
      last = generator.generate(target);
      truncatedTotal += last.truncatedAdds;
      ctx.postMessage({
        type: 'progress',
        requestId,
        added: last.sequence.slice(reportedLength),
        currentNumber: last.currentNumber,
        probability: last.probability,
        combinations: last.combinations,
        skipped: last.skippedCombinations,
        truncatedAdds: truncatedTotal
      });
      reportedLength = last.sequence.length;
      await sleep();
    }

    if (activeRequestId !== requestId) return;

    ctx.postMessage({
      type: 'done',
      requestId,
      stopped: stopRequested || last.sequence.length < count,
      sequence: last.sequence,
      currentNumber: last.currentNumber,
      probability: last.probability,
      probabilitySum: last.probabilitySum,
      combinations: last.combinations,
      skipped: last.skippedCombinations,
      truncatedAdds: truncatedTotal
    });
  } catch (error) {
    if (activeRequestId === requestId) {
      ctx.postMessage({
        type: 'error',
        requestId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

ctx.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;
  if (message.type === 'start') {
    void runJob(message);
  } else if (message.type === 'stop') {
    stopRequested = true;
  }
};
