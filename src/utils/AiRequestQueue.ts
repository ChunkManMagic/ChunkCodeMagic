/**
 * Safe client-side request queue manager for streaming AI prompts in PersonaForge.
 * Ensures outgoing prompts are processed sequentially (First-In-First-Out / FIFO),
 * handles automatic exponential-backoff retries for transient connection drops,
 * and cancels queued messages if the chat session is reset.
 */

type RequestTask = {
  id: string;
  prompt: string;
  execute: (prompt: string) => Promise<void>;
  onError: (error: Error) => void;
};

export class AiRequestQueue {
  private queue: RequestTask[] = [];
  private isProcessing = false;
  private maxRetries = 3;
  private baseDelayMs = 1000;

  /**
   * Enqueues an outgoing prompt to be processed in order.
   */
  public enqueue(
    prompt: string,
    execute: (prompt: string) => Promise<void>,
    onError: (error: Error) => void
  ): string {
    const id = Math.random().toString(36).substring(2, 9);
    const task: RequestTask = { id, prompt, execute, onError };
    this.queue.push(task);
    this.processNext();
    return id;
  }

  /**
   * Clears all queued requests (e.g. on chat window reset or unmount).
   */
  public clear(): void {
    this.queue = [];
    this.isProcessing = false;
  }

  /**
   * Processes the next task in the queue using FIFO scheduling.
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const task = this.queue[0];
    let attempts = 0;
    let success = false;

    while (attempts < this.maxRetries && !success) {
      try {
        await task.execute(task.prompt);
        success = true;
      } catch (error) {
        attempts++;
        if (attempts >= this.maxRetries) {
          task.onError(error instanceof Error ? error : new Error(String(error)));
        } else {
          const delay = this.baseDelayMs * Math.pow(2, attempts);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    this.queue.shift(); // Remove completed or failed task
    this.isProcessing = false;
    this.processNext(); // Trigger next task
  }
}
