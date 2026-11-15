/** HTTP types and helpers shared by the `api` handlers. */

/** The subset of the Express request the handlers read. */
export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  rawBody?: Buffer;
}

/** The subset of the Express response the handlers write. */
export interface HttpResponse {
  status(code: number): HttpResponse;
  set(field: string, value: string): HttpResponse;
  json(body: unknown): unknown;
  end(): unknown;
}

export type HttpHandler = (req: HttpRequest, res: HttpResponse) => Promise<void>;

export function error(res: HttpResponse, status: number, code: string): void {
  res.status(status).json({ error: code });
}

export function noContent(res: HttpResponse, status = 204): void {
  res.status(status).end();
}

export function header(req: HttpRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function bodySize(req: HttpRequest): number {
  if (req.rawBody) {
    return req.rawBody.length;
  }
  const length = Number(header(req, 'content-length') ?? 0);
  return Number.isFinite(length) ? length : 0;
}

export function isJson(req: HttpRequest): boolean {
  const type = header(req, 'content-type') ?? '';
  return type.split(';')[0].trim().toLowerCase() === 'application/json';
}
