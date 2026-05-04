import type { ServerEvent } from "../protocol";

type Handler = (event: ServerEvent) => void;

export class JobSocket {
  private url: string;
  private socket: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private reconnectDelay = 500;
  private closed = false;

  constructor(httpBase: string) {
    const u = new URL(httpBase);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/ws";
    this.url = u.toString();
    this.connect();
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close() {
    this.closed = true;
    this.socket?.close();
  }

  private connect() {
    if (this.closed) return;
    try {
      this.socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.reconnectDelay = 500;
    };
    this.socket.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as ServerEvent;
        for (const h of this.handlers) {
          try {
            h(event);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    };
    this.socket.onerror = () => {
      // onclose will follow
    };
    this.socket.onclose = () => {
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.closed) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 5000);
    setTimeout(() => this.connect(), delay);
  }
}
