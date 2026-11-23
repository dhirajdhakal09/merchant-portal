import { HttpErrorResponse } from '@angular/common/http';

/**
 * HTTP status of an error, e.g. from rxResource's error() signal.
 * rxResource passes an HttpErrorResponse through as is, but wraps anything that isn't
 * Error-like, keeping the original in `cause`; both forms are handled.
 * Returns undefined if the error didn't come from an HTTP response.
 */
export function httpStatusOf(error: unknown): number | undefined {
  if (error instanceof HttpErrorResponse) return error.status;
  const cause = (error as { cause?: unknown } | undefined)?.cause;
  return cause instanceof HttpErrorResponse ? cause.status : undefined;
}
