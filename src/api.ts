import { requestUrl } from "obsidian";

/** A scene / event / sound as returned by the server's list endpoints (the fields we use). */
export interface Entity {
  id: string;
  name: string;
  image?: string | null;
  category?: string;
}

export type ListKind = "scene" | "event" | "sound";

export interface FireResult {
  ok: boolean;
  status: number;
  message?: string;
}

/** Live "what's on right now" snapshot, used to highlight active buttons. */
export interface LiveState {
  activeScene: string;
  runningEvent: string;
  playingSounds: string[];
}

interface ApiSettings {
  baseUrl: string;
  apiKey: string;
}

const LIST_PATH: Record<ListKind, string> = {
  scene: "/scenes/",
  event: "/events/list",
  sound: "/sounds/list",
};

const CACHE_TTL_MS = 15_000;

/**
 * Thin client over the Ambient Director HTTP API. Uses Obsidian's requestUrl so requests
 * bypass CORS (the API sets no CORS headers) and work the same on desktop and mobile.
 */
export class AmbientDirectorApi {
  private cache: Partial<Record<ListKind, { at: number; items: Entity[] }>> = {};

  constructor(private getSettings: () => ApiSettings) {}

  private base(): string {
    return (this.getSettings().baseUrl || "").trim().replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    const key = this.getSettings().apiKey?.trim();
    return key ? { "X-Api-Key": key } : {};
  }

  /** Absolute URL of an uploaded tile-art image, carrying the API key as a query param. */
  imageUrl(image: string): string {
    const key = this.getSettings().apiKey?.trim();
    const q = key ? `?apiKey=${encodeURIComponent(key)}` : "";
    return `${this.base()}/images/${encodeURIComponent(image)}${q}`;
  }

  /** Fire a command (GET). Never throws — failures come back as { ok: false }. */
  async fire(path: string): Promise<FireResult> {
    const base = this.base();
    if (!base) return { ok: false, status: 0, message: "Set the server address in settings" };
    try {
      const res = await requestUrl({ url: base + path, method: "GET", headers: this.headers(), throw: false });
      const ok = res.status >= 200 && res.status < 300;
      return { ok, status: res.status, message: ok ? undefined : errorText(res) };
    } catch (e) {
      return { ok: false, status: 0, message: e instanceof Error ? e.message : String(e) };
    }
  }

  /** List scenes/events/sounds, cached briefly. Returns the last good list on failure. */
  async list(kind: ListKind, force = false): Promise<Entity[]> {
    const cached = this.cache[kind];
    if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.items;
    const base = this.base();
    if (!base) return cached?.items ?? [];
    try {
      const res = await requestUrl({ url: base + LIST_PATH[kind], method: "GET", headers: this.headers(), throw: false });
      if (res.status < 200 || res.status >= 300) return cached?.items ?? [];
      const raw: unknown = res.json;
      if (!Array.isArray(raw)) return cached?.items ?? [];
      const items: Entity[] = raw.map((entry) => {
        const x = (entry ?? {}) as { id?: unknown; name?: unknown; image?: unknown; category?: unknown };
        return {
          id: String(x.id ?? ""),
          name: String(x.name ?? ""),
          image: typeof x.image === "string" ? x.image : null,
          category: typeof x.category === "string" ? x.category : undefined,
        };
      });
      this.cache[kind] = { at: Date.now(), items };
      return items;
    } catch {
      return cached?.items ?? [];
    }
  }

  /** Fetch the live active-scene / running-event / playing-sounds snapshot. Never throws. */
  async getLiveState(): Promise<LiveState> {
    const empty: LiveState = { activeScene: "", runningEvent: "", playingSounds: [] };
    if (!this.base()) return empty;
    const [scene, event, sounds] = await Promise.all([
      this.getJson("/scenes/active"),
      this.getJson("/events/state"),
      this.getJson("/sounds/state"),
    ]);
    const playing = (sounds as { playing?: unknown })?.playing;
    return {
      activeScene: String((scene as { id?: unknown })?.id ?? ""),
      runningEvent: String((event as { runningId?: unknown })?.runningId ?? ""),
      playingSounds: Array.isArray(playing) ? playing.map((x) => String(x)) : [],
    };
  }

  private async getJson(path: string): Promise<unknown> {
    try {
      const res = await requestUrl({ url: this.base() + path, method: "GET", headers: this.headers(), throw: false });
      if (res.status < 200 || res.status >= 300) return null;
      return res.json;
    } catch {
      return null;
    }
  }

  clearCache(): void {
    this.cache = {};
  }
}

function errorText(res: { status: number; json?: unknown }): string {
  try {
    const j = res.json as { detail?: string; title?: string } | undefined;
    if (j && (j.detail || j.title)) return j.detail || j.title || `HTTP ${res.status}`;
  } catch {
    /* body wasn't JSON */
  }
  return `HTTP ${res.status}`;
}
