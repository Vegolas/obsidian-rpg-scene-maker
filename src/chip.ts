import type SceneMakerPlugin from "./main";
import { DEFAULT_ICON, ListKindOf, SmToken, lightsLabel, splitName } from "./tokens";

/**
 * Build the clickable element for a token. Renders immediately with a best-guess label
 * (the token arg), then enhances asynchronously with the entity's real name, leading emoji
 * and — when enabled — its tile art. Style (compact chip vs full-width banner) comes from
 * the global setting, and scene/event/sound chips register for live active-state highlighting.
 */
export function buildChip(plugin: SceneMakerPlugin, token: SmToken): HTMLElement {
  const banner = plugin.settings.render === "banner";
  const el = createEl("a", { cls: ["sm-chip", `sm-chip-${token.kind}`] });
  if (banner) el.addClass("sm-chip--banner");
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `RPG Scene Maker: ${token.kind} ${token.arg}`.trim());
  el.tabIndex = 0;

  const icon = el.createSpan({ cls: "sm-chip-icon", text: DEFAULT_ICON[token.kind] });
  const label = el.createSpan({ cls: "sm-chip-label", text: token.label ?? token.arg ?? token.kind });

  void enhance(plugin, token, el, icon, label, banner);

  const fire = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    void plugin.fire(token);
  };
  el.addEventListener("click", fire);
  el.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (ev.key === "Enter" || ev.key === " ") fire(ev);
  });

  if (plugin.settings.highlightActive && ListKindOf(token.kind)) {
    plugin.tracker.register(token, el, (active) => el.toggleClass("is-active", active));
  }

  return el;
}

async function enhance(
  plugin: SceneMakerPlugin,
  token: SmToken,
  chip: HTMLElement,
  icon: HTMLElement,
  label: HTMLElement,
  banner: boolean,
): Promise<void> {
  const listKind = ListKindOf(token.kind);
  if (!listKind) {
    // music / lights: no entity to resolve — give a sensible default label if none was set.
    if (!token.label) label.setText(token.kind === "music" ? "Play music" : lightsLabel(token.arg));
    return;
  }

  let items;
  try {
    items = await plugin.api.list(listKind);
  } catch {
    return;
  }
  const found = items.find((i) => i.id.toLowerCase() === token.arg.toLowerCase());
  if (!found) {
    chip.addClass("sm-chip-missing");
    chip.setAttribute("aria-label", `RPG Scene Maker: unknown ${token.kind} "${token.arg}"`);
    return;
  }

  const { emoji, label: name } = splitName(found.name);
  if (!token.label) label.setText(name || found.id);

  if (plugin.settings.showThumbnails && found.image) {
    const url = plugin.api.imageUrl(found.image);
    if (banner) {
      // Art fills the banner as a darkened background so the label stays legible.
      chip.addClass("sm-has-art");
      chip.style.backgroundImage = `linear-gradient(rgba(8, 10, 14, 0.5), rgba(8, 10, 14, 0.72)), url("${cssUrl(url)}")`;
      if (emoji) icon.setText(emoji);
    } else {
      const img = createEl("img", { cls: "sm-chip-art" });
      img.src = url;
      img.onerror = () => icon.setText(emoji || DEFAULT_ICON[token.kind]);
      icon.empty();
      icon.appendChild(img);
    }
  } else if (emoji) {
    icon.setText(emoji);
  }
}

/** Escape a URL for safe embedding inside a CSS url("...") value. */
function cssUrl(url: string): string {
  return url.replace(/["\\]/g, "\\$&");
}
