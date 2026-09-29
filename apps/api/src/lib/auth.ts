import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@hypercore/auth";

export interface AuthedRequest extends Request {
  userId: string;
}

/** Rejects requests without a valid better-auth session cookie. */
export async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cookieHeader = req.headers.cookie ?? "";
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user) {
      console.warn(
        `[auth] denied ${req.method} ${req.originalUrl} ` +
          `origin=${req.headers.origin ?? "none"} ` +
          `cookies=[${cookieHeader.split(";").map((c) => c.trim().split("=")[0]).filter(Boolean).join(",") || "none"}]`,
      );
      res.status(401).json({
        error: "Sign in required",
        reason: cookieHeader ? "invalid-session" : "missing-cookie",
      });
      return;
    }
    (req as AuthedRequest).userId = session.user.id;
    next();
  } catch {
    res.status(401).json({ error: "Sign in required", reason: "lookup-failed" });
  }
}
