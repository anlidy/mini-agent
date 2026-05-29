import type { Session } from "./Session.js";

export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  getOrCreate(key: string): Session {
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const session: Session = {
      key,
      messages: [],
      createdAt: now,
      updatedAt: now,
      metadata: {}
    };
    this.sessions.set(key, session);
    return session;
  }
}
