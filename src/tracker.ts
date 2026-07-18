import type SceneMakerPlugin from "./main";
import { ListKindOf, SmToken } from "./tokens";

interface ChipReg {
  token: SmToken;
  el: HTMLElement;
  apply: (active: boolean) => void;
}

/**
 * Polls the server's live state and marks chips whose scene/event/sound is currently on.
 * A single poll (every few seconds, only while chips are on screen) updates every chip, so
 * a button lights up even when its scene was activated from the panel or a Stream Deck.
 */
export class StateTracker {
  private regs = new Set<ChipReg>();
  private activeScene = "";
  private runningEvent = "";
  private playing = new Set<string>();
  private inFlight = false;
  private lastFetch = 0;

  constructor(private plugin: SceneMakerPlugin) {}

  /** Register a live chip. Only scene/event/sound have a meaningful active state. */
  register(token: SmToken, el: HTMLElement, apply: (active: boolean) => void): void {
    if (!ListKindOf(token.kind)) return;
    this.regs.add({ token, el, apply });
    apply(this.isActive(token)); // reflect what we already know immediately
    this.maybeRefresh(); // throttled: coalesces the burst of registers on (re)render
  }

  isActive(token: SmToken): boolean {
    const id = token.arg.toLowerCase();
    switch (token.kind) {
      case "scene":
        return this.activeScene !== "" && this.activeScene.toLowerCase() === id;
      case "event":
        return this.runningEvent !== "" && this.runningEvent.toLowerCase() === id;
      case "sound":
        return this.playing.has(id);
      default:
        return false;
    }
  }

  /** Periodic heartbeat (called on an interval). Polls only while chips are visible. */
  async tick(): Promise<void> {
    this.prune();
    if (this.regs.size === 0 || !this.plugin.settings.highlightActive) return;
    await this.refresh();
  }

  /** Force a poll now (used after firing a command so the change shows quickly). */
  async refresh(): Promise<void> {
    if (this.inFlight || !this.plugin.settings.highlightActive) return;
    this.inFlight = true;
    try {
      const s = await this.plugin.api.getLiveState();
      this.activeScene = s.activeScene;
      this.runningEvent = s.runningEvent;
      this.playing = new Set(s.playingSounds.map((x) => x.toLowerCase()));
      this.notify();
    } finally {
      this.inFlight = false;
      this.lastFetch = Date.now();
    }
  }

  private maybeRefresh(): void {
    if (this.inFlight || Date.now() - this.lastFetch < 2500) return;
    void this.refresh();
  }

  private notify(): void {
    for (const reg of this.regs) reg.apply(this.isActive(reg.token));
  }

  private prune(): void {
    for (const reg of this.regs) {
      if (!reg.el.isConnected) this.regs.delete(reg);
    }
  }
}
