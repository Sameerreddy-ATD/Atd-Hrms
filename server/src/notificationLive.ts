import type { Request, Response } from "express";

const subscribers = new Map<string, Set<Response>>();

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

  const userId = req.user.id;
  if (!subscribers.has(userId)) subscribers.set(userId, new Set());
  subscribers.get(userId)!.add(res);

  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
  const close = () => {
    clearInterval(heartbeat);
    const userSet = subscribers.get(userId);
    if (userSet) {
      userSet.delete(res);
      if (userSet.size === 0) subscribers.delete(userId);
    }
  };
  req.on("close", close);
  res.on("close", close);
}

export function publishNotificationChange(type: string, id: string, userIds?: string[]) {
  const payload = JSON.stringify({ type, id, time: new Date().toISOString() });
  if (userIds && userIds.length > 0) {
    for (const userId of userIds) {
      const userSet = subscribers.get(userId);
      if (!userSet) continue;
      for (const response of userSet) {
        response.write(`event: notification\ndata: ${payload}\n\n`);
      }
    }
    return;
  }
  for (const userSet of subscribers.values()) {
    for (const response of userSet) {
      response.write(`event: notification\ndata: ${payload}\n\n`);
    }
  }
}
