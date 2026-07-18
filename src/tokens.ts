// Parsing + helpers for the inline `sm:...` syntax used in notes.
//
// Grammar (inside inline code): sm:<kind>[:<arg>][|<label>]
//   sm:scene:city              activate scene "city"
//   sm:event:thunderclap       trigger event "thunderclap"
//   sm:sound:tavern-crowd      play sound "tavern-crowd"
//   sm:music:spotify:...       play a Spotify URI/link (arg may itself contain ':')
//   sm:lights:reset            reset lights to default (also :off / :on; bare sm:lights == reset)
//   sm:scene:city|▶ Enter town custom button label after '|'

export type SmKind = "scene" | "event" | "sound" | "music" | "lights";

export const SM_KINDS: SmKind[] = ["scene", "event", "sound", "music", "lights"];

/** Fallback glyph shown when an entity has no leading emoji in its name. */
export const DEFAULT_ICON: Record<SmKind, string> = {
  scene: "🎬",
  event: "✨",
  sound: "🔊",
  music: "🎵",
  lights: "💡",
};

export interface SmToken {
  kind: SmKind;
  /** id (scene/event/sound), Spotify URI (music), or reset|off|on (lights). May be empty for lights. */
  arg: string;
  /** Optional explicit button label after a '|'. */
  label?: string;
  /** The original token body (without backticks), used for widget equality. */
  raw: string;
}

const KIND_RE = /^sm:(scene|event|sound|music|lights)(?::([\s\S]*))?$/;

/** Parse the text content of an inline-code span. Returns null when it isn't an `sm:` token. */
export function parseToken(text: string | null | undefined): SmToken | null {
  if (!text) return null;
  let body = text.trim();
  if (!body.startsWith("sm:")) return null;

  let label: string | undefined;
  const pipe = body.indexOf("|");
  if (pipe >= 0) {
    label = body.slice(pipe + 1).trim() || undefined;
    body = body.slice(0, pipe).trim();
  }

  const m = KIND_RE.exec(body);
  if (!m) return null;
  const kind = m[1] as SmKind;
  const arg = (m[2] ?? "").trim();
  // scene/event/sound/music need an argument to do anything; lights defaults to "reset".
  if (kind !== "lights" && arg === "") return null;
  return { kind, arg, label, raw: body };
}

/** The GET endpoint path (relative to the server base URL) that fires this token. */
export function pathFor(t: SmToken): string {
  switch (t.kind) {
    case "scene":
      return `/scenes/${encodeURIComponent(t.arg)}/activate`;
    case "event":
      return `/events/${encodeURIComponent(t.arg)}/trigger`;
    case "sound":
      return `/sounds/${encodeURIComponent(t.arg)}/play`;
    case "music":
      return `/music/play?id=${encodeURIComponent(t.arg)}`;
    case "lights": {
      const a = (t.arg || "reset").toLowerCase();
      return a === "off" ? "/lights/off" : a === "on" ? "/lights/on" : "/lights/default";
    }
  }
}

/** Split a leading emoji off an entity name, mirroring the panel's SceneNaming.SplitName. */
export function splitName(name: string | null | undefined): { emoji: string; label: string } {
  const trimmed = (name ?? "").trim();
  const space = trimmed.indexOf(" ");
  if (space > 0 && [...trimmed.slice(0, space)].some((c) => (c.codePointAt(0) ?? 0) > 0x2000)) {
    return { emoji: trimmed.slice(0, space), label: trimmed.slice(space + 1) };
  }
  return { emoji: "", label: trimmed };
}

/** The list endpoint kind backing a token kind, or null for kinds with no entity list (music/lights). */
export function ListKindOf(kind: SmKind): "scene" | "event" | "sound" | null {
  return kind === "scene" || kind === "event" || kind === "sound" ? kind : null;
}

/** Human label for a bare lights token, used when no entity name applies. */
export function lightsLabel(arg: string): string {
  const a = (arg || "reset").toLowerCase();
  return a === "off" ? "Lights off" : a === "on" ? "Lights on" : "Reset lights";
}
