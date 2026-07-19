import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from "obsidian";
import type AmbientDirectorPlugin from "./main";
import { Entity } from "./api";
import { DEFAULT_ICON, ListKindOf, SM_KINDS, SmKind, splitName } from "./tokens";

type Suggestion =
  | { type: "kind"; kind: SmKind }
  | { type: "entity"; kind: SmKind; entity: Entity }
  | { type: "literal"; kind: "lights"; value: string; label: string };

const LIGHTS_OPTIONS = [
  { value: "reset", label: "Reset to default" },
  { value: "off", label: "All off" },
  { value: "on", label: "All on" },
];

// A leading boundary so we don't fire mid-word: start of line, whitespace, or an opening bracket/backtick.
const ID_TRIGGER = /(?:^|[\s`([{])sm:(scene|event|sound|music|lights):([^\s`|]*)$/;
const KIND_TRIGGER = /(?:^|[\s`([{])sm:([a-z]*)$/;

/** Autocomplete for the `sm:...` syntax: first the kind, then the matching scene/event/sound id. */
export class AmbientDirectorSuggest extends EditorSuggest<Suggestion> {
  private mode: "kind" | "entity" = "kind";
  private kind: SmKind = "scene";

  constructor(
    app: App,
    private plugin: AmbientDirectorPlugin,
  ) {
    super(app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    const before = editor.getLine(cursor.line).slice(0, cursor.ch);

    const idMatch = ID_TRIGGER.exec(before);
    if (idMatch) {
      this.mode = "entity";
      this.kind = idMatch[1] as SmKind;
      const query = idMatch[2] ?? "";
      return { start: { line: cursor.line, ch: cursor.ch - query.length }, end: cursor, query };
    }

    const kindMatch = KIND_TRIGGER.exec(before);
    if (kindMatch) {
      this.mode = "kind";
      const query = kindMatch[1] ?? "";
      return { start: { line: cursor.line, ch: cursor.ch - query.length }, end: cursor, query };
    }

    return null;
  }

  async getSuggestions(ctx: EditorSuggestContext): Promise<Suggestion[]> {
    const q = ctx.query.toLowerCase();

    if (this.mode === "kind") {
      return SM_KINDS.filter((k) => k.startsWith(q)).map((k) => ({ type: "kind", kind: k }));
    }

    if (this.kind === "music") return []; // Spotify URIs come from the panel, nothing to suggest here.

    if (this.kind === "lights") {
      return LIGHTS_OPTIONS.filter((o) => !q || o.value.startsWith(q)).map((o) => ({
        type: "literal",
        kind: "lights",
        value: o.value,
        label: o.label,
      }));
    }

    const listKind = ListKindOf(this.kind);
    if (!listKind) return [];
    const items = await this.plugin.api.list(listKind);
    return items
      .filter((e) => !q || e.id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
      .slice(0, 50)
      .map((e) => ({ type: "entity", kind: this.kind, entity: e }));
  }

  renderSuggestion(s: Suggestion, el: HTMLElement): void {
    el.addClass("sm-suggestion");

    if (s.type === "kind") {
      el.createSpan({ cls: "sm-chip-icon", text: DEFAULT_ICON[s.kind] });
      el.createSpan({ cls: "sm-suggestion-name", text: s.kind });
      return;
    }

    if (s.type === "literal") {
      el.createSpan({ cls: "sm-chip-icon", text: DEFAULT_ICON.lights });
      el.createSpan({ cls: "sm-suggestion-name", text: s.label });
      return;
    }

    const { emoji, label } = splitName(s.entity.name);
    if (this.plugin.settings.showThumbnails && s.entity.image) {
      const img = el.createEl("img", { cls: "sm-suggestion-art" });
      img.src = this.plugin.api.imageUrl(s.entity.image);
    } else {
      el.createSpan({ cls: "sm-chip-icon", text: emoji || DEFAULT_ICON[s.kind] });
    }
    const box = el.createSpan({ cls: "sm-suggestion-name" });
    box.createSpan({ text: label || s.entity.id });
    box.createEl("small", { cls: "sm-suggestion-id", text: s.entity.id });
  }

  selectSuggestion(s: Suggestion, _evt: MouseEvent | KeyboardEvent): void {
    const ctx = this.context;
    if (!ctx) return;
    const editor = ctx.editor;

    if (s.type === "kind") {
      // ctx range covers the partial kind after "sm:"; complete it to "<kind>:" and sit the caret after.
      const insert = `${s.kind}:`;
      editor.replaceRange(insert, ctx.start, ctx.end);
      editor.setCursor({ line: ctx.start.line, ch: ctx.start.ch + insert.length });
      return;
    }

    const value = s.type === "entity" ? s.entity.id : s.value;
    editor.replaceRange(value, ctx.start, ctx.end);
    editor.setCursor({ line: ctx.start.line, ch: ctx.start.ch + value.length });
  }
}
