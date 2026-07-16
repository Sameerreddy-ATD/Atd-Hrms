import type { Request, Response } from "express";

const subscribers = new Set<Response>();

export function openNotificationStream(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).end();
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("event: connected\ndata: {}\n\n");
  subscribers.add(res);

  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
  const close = () => {
    clearInterval(heartbeat);
    subscribers.delete(res);
  };
  req.on("close", close);
  res.on("close", close);
}

export function publishNotificationChange(type: string, id: string) {
  const payload = JSON.stringify({ type, id, time: new Date().toISOString() });
  for (const response of subscribers) {
    response.write(`event: notification\ndata: ${payload}\n\n`);
  }
}
