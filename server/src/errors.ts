import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

const BODY_PARSER_MESSAGES: Record<number, string> = {
  400: "Request body could not be read",
  413: "Request body is too large",
  415: "Unsupported content type",
};

/** Recognises body-parser/http-errors rejections so they keep their 4xx status. */
function bodyParserErrorStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const candidate = err as { status?: unknown; statusCode?: unknown; type?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : candidate.statusCode;
  if (typeof status !== "number" || status < 400 || status >= 500) return null;
  if (typeof candidate.type !== "string" || !candidate.type.startsWith("entity.")) return null;
  return BODY_PARSER_MESSAGES[status] ? status : 400;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path?.length ? first.path.join(".") : null;
    const detail = first?.message ?? "Invalid input";
    const message = field ? `${field}: ${detail}` : detail;
    return res.status(400).json({ error: message, details: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return res.status(404).json({ error: "Record not found" });
    if (err.code === "P2002") return res.status(409).json({ error: "Duplicate record" });
    if (err.code === "P2003")
      return res.status(400).json({ error: "Referenced record is invalid or unavailable" });
    if (err.code === "P2004")
      return res.status(400).json({ error: "The database rejected an invalid workflow state" });
  }
  // body-parser rejects unparseable or oversized payloads with an http-errors
  // object. Without this the client sees a 500 and the noise lands in the error
  // log as if the server had faulted.
  const bodyParserStatus = bodyParserErrorStatus(err);
  if (bodyParserStatus) {
    return res.status(bodyParserStatus).json({ error: BODY_PARSER_MESSAGES[bodyParserStatus] });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
