/** An error that will fail the same way every time (bad photo, missing key, 4xx from OpenAI…).
    The job queue marks the product "failed" straight away instead of retrying — retries could cost money. */
export class NonRetryable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryable";
  }
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
