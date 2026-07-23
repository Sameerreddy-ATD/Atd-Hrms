import type { Request, Response } from "express";

const subscribers = new Map<string, Set<Response>>();

export function openAttendanceStream(req: Request, res: Response) {
  const employeeId = req.user?.employeeId;
  if (!employeeId) {
    res.status(204).end();
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`event: connected\ndata: ${JSON.stringify({ employeeId })}\n\n`);

  const employeeSubscribers = subscribers.get(employeeId) ?? new Set<Response>();
  employeeSubscribers.add(res);
  subscribers.set(employeeId, employeeSubscribers);

  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
  const close = () => {
    clearInterval(heartbeat);
    employeeSubscribers.delete(res);
    if (!employeeSubscribers.size) subscribers.delete(employeeId);
  };
  req.on("close", close);
  res.on("close", close);
}

export function publishAttendanceChange(employeeId: string, date: Date) {
  const payload = JSON.stringify({ employeeId, date: date.toISOString().slice(0, 10) });
  for (const response of subscribers.get(employeeId) ?? []) {
    response.write(`event: attendance\ndata: ${payload}\n\n`);
  }
}
