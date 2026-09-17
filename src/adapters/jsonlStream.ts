import * as fs from 'fs';
import * as crypto from 'crypto';

export type JsonlStreamResult = {
  parsedBytes: number;
  lineCount: number;
  sawContent: boolean;
  partialTail?: string;
  tailHash: string;
};

export async function streamJsonlLines(
  filePath: string,
  onLine: (line: string, lineNumber: number) => void,
  options: { start?: number; lineNumberBase?: number } = {},
): Promise<JsonlStreamResult> {
  const start = options.start ?? 0;
  let lineNumber = options.lineNumberBase ?? 1;
  let lineCount = 0;
  let parsedBytes = start;
  let sawContent = false;
  let partialTail = '';

  const stat = await fs.promises.stat(filePath);
  if (stat.size <= start) {
    return {
      parsedBytes: start,
      lineCount: 0,
      sawContent: false,
      tailHash: '',
    };
  }

  const hash = crypto.createHash('sha256');
  const fd = await fs.promises.open(filePath, 'r');
  const bufferSize = 64 * 1024;
  const buffer = Buffer.alloc(bufferSize);
  let leftover = '';
  let position = start;

  try {
    while (position < stat.size) {
      const { bytesRead } = await fd.read(buffer, 0, bufferSize, position);
      if (bytesRead === 0) break;

      hash.update(buffer.subarray(0, bytesRead));
      const chunkStr = leftover + buffer.toString('utf8', 0, bytesRead);
      const lines = chunkStr.split('\n');

      // The last element is whatever remains after the last newline
      leftover = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.replace(/\r$/, '');
        if (trimmed.length > 0) {
          sawContent = true;
          onLine(trimmed, lineNumber++);
          lineCount++;
        }
      }

      position += bytesRead;
      parsedBytes = position - Buffer.byteLength(leftover, 'utf8');
    }

    if (leftover.trim().length > 0) {
      partialTail = leftover;
    }
  } finally {
    await fd.close();
  }

  return {
    parsedBytes,
    lineCount,
    sawContent,
    partialTail: partialTail || undefined,
    tailHash: hash.digest('hex'),
  };
}
