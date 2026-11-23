import { HttpResponse } from 'msw';
import type { FieldError, ValidationErrorResponse } from '../core/models/application.model';

/** Reads a JSON body without throwing; returns null if the body is missing or isn't a JSON object. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** JSON error body `{ message }` with the given status. */
export const errorResponse = (status: number, message: string) =>
  HttpResponse.json({ message }, { status });

/** 422 Unprocessable Entity with field-level errors. */
export const validationError = (errors: FieldError[], message = 'Some fields are invalid') =>
  HttpResponse.json<ValidationErrorResponse>({ message, errors }, { status: 422 });
