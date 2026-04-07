import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from './config';
import { IncomingMessage, TradeSignal } from './types';

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export class SlaveWsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private destroyed = false;

  connect(): void {
    if (this.destroyed) return;

    // Auth is passed as query params — server reads ?id=... &key=...
    const url = `${config.serverUrl}/ws/slave?id=${config.accountId}&key=${config.slaveKey}`;

    console.log(`[WS] Connecting to ${config.serverUrl} as "${config.accountId}"...`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      console.log('[WS] Connected to master server');
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('ping', () => {
      // Respond to server heartbeat — keeps the connection alive
      this.ws?.pong();
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[WS] Disconnected — code: ${code} reason: ${reason.toString() || '(none)'}`);

      // 4001 = invalid credentials — retrying with the same key is pointless
      if (code === 4001) {
        console.error('[WS] Authentication rejected — check ACCOUNT_ID and SLAVE_KEY in .env');
        process.exit(1);
      }

      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      // 'error' always precedes 'close' in ws — log it, reconnect handled in 'close'
      console.error(`[WS] Error: ${err.message}`);
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.ws?.terminate();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private handleMessage(raw: string): void {
    let msg: IncomingMessage;

    try {
      msg = JSON.parse(raw);
    } catch {
      console.warn(`[WS] Received non-JSON message: ${raw}`);
      return;
    }

    if (msg.type === 'connected') {
      console.log(`[WS] Server confirmed connection — label: "${msg.label}"`);
      return;
    }

    if (msg.type === 'entry' || msg.type === 'exit') {
      console.log(
        `[WS] Signal received: ${msg.type} ${msg.symbol}` +
          (msg.type === 'entry' ? ` ${msg.action} x${msg.quantity}` : ` reason: ${msg.reason}`),
      );
      // Emit to whoever is listening (index.ts feeds this into the queue)
      this.emit('signal', msg as TradeSignal);
      return;
    }

    console.warn(`[WS] Unknown message type: ${(msg as any).type}`);
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `[WS] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached — giving up`,
      );
      process.exit(1);
    }

    // Exponential backoff with jitter: 1s → 2s → 4s → ... → 30s max
    const exponential = BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts);
    const delay = Math.min(exponential, MAX_RECONNECT_DELAY_MS);
    const jitter = Math.floor(Math.random() * 1_000);
    this.reconnectAttempts++;

    console.log(
      `[WS] Reconnecting in ${Math.round((delay + jitter) / 1000)}s ` +
        `(attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
    );

    setTimeout(() => this.connect(), delay + jitter);
  }
}
