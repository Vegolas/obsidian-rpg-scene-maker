import { Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import type SceneMakerPlugin from "./main";
import { buildChip } from "./chip";
import { SmToken, parseToken } from "./tokens";

// Inline-code `sm:...` tokens, including the surrounding backticks so the whole thing is replaced.
const TOKEN_RE = /`(sm:(?:scene|event|sound|music|lights)(?::[^`\n]*)?)`/g;

class ChipWidget extends WidgetType {
  constructor(
    private plugin: SceneMakerPlugin,
    private raw: string,
    private token: SmToken,
  ) {
    super();
  }

  eq(other: ChipWidget): boolean {
    return other.raw === this.raw && other.plugin === this.plugin;
  }

  toDOM(): HTMLElement {
    return buildChip(this.plugin, this.token);
  }

  ignoreEvent(): boolean {
    return false; // let the chip handle its own click
  }
}

/**
 * Live Preview rendering: replace inline `sm:...` code tokens with clickable chips, except while
 * the caret/selection sits inside a token (so it stays editable as plain text). Reading view is
 * handled separately by the markdown post-processor in main.ts.
 */
export function livePreviewExtension(plugin: SceneMakerPlugin): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(plugin, view);
      }

      update(u: ViewUpdate): void {
        if (u.docChanged || u.viewportChanged || u.selectionSet) {
          this.decorations = build(plugin, u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function build(plugin: SceneMakerPlugin, view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const sel = view.state.selection.main;
  try {
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      TOKEN_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TOKEN_RE.exec(text)) !== null) {
        const start = from + m.index;
        const end = start + m[0].length;
        // Leave the raw text visible while editing this token.
        if (sel.from <= end && sel.to >= start) continue;
        const token = parseToken(m[1]);
        if (!token) continue;
        builder.add(start, end, Decoration.replace({ widget: new ChipWidget(plugin, m[0], token) }));
      }
    }
  } catch (e) {
    // A decoration failure must never break the editor; fall back to plain text.
    console.error("RPG Scene Maker: live-preview decoration failed", e);
  }
  return builder.finish();
}
