import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";
import { errorHandler, HttpError } from "../server/src/errors.js";

type Captured = { status: number; body: unknown };

function runHandler(error: unknown): Captured {
  const captured: Captured = { status: 0, body: null };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errorHandler(error, {} as any, res as any, (() => {}) as any);
  return captured;
}

/** Mirrors the shape body-parser throws via http-errors. */
function bodyParserError(status: number, type: string) {
  return Object.assign(new SyntaxError("Unexpected token in JSON"), {
    status,
    statusCode: status,
    type,
    expose: true,
  });
}

describe("errorHandler", () => {
  it("keeps the 4xx status when body-parser rejects an unreadable payload", () => {
    const result = runHandler(bodyParserError(400, "entity.parse.failed"));
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Request body could not be read" });
  });

  it("reports an oversized payload as 413 rather than a server fault", () => {
    const result = runHandler(bodyParserError(413, "entity.too.large"));
    expect(result.status).toBe(413);
    expect(result.body).toEqual({ error: "Request body is too large" });
  });

  it("reports an unsupported content type as 415", () => {
    const result = runHandler(bodyParserError(415, "entity.unsupported.charset"));
    expect(result.status).toBe(415);
  });

  it("still returns 500 for a genuine server fault", () => {
    const result = runHandler(new Error("database connection lost"));
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
  });

  it("does not leak the message of an unexpected error", () => {
    const result = runHandler(new Error("connect ECONNREFUSED 10.0.0.5:3306"));
    expect(JSON.stringify(result.body)).not.toContain("10.0.0.5");
  });

  it("passes through an explicit HttpError status and message", () => {
    const result = runHandler(new HttpError(403, "You cannot update this review"));
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "You cannot update this review" });
  });

  it("turns a Zod failure into a field-scoped 400", () => {
    let error: ZodError | null = null;
    try {
      z.object({ email: z.string().email() }).parse({ email: "nope" });
    } catch (caught) {
      error = caught as ZodError;
    }
    const result = runHandler(error);
    expect(result.status).toBe(400);
    expect(String((result.body as { error: string }).error)).toContain("email");
  });

  it("ignores a 4xx status on an error that did not come from body-parser", () => {
    // Without the `entity.` type guard an arbitrary object could dictate the
    // response status, so this must still be treated as a server fault.
    const result = runHandler(Object.assign(new Error("spoofed"), { status: 401 }));
    expect(result.status).toBe(500);
  });
});
