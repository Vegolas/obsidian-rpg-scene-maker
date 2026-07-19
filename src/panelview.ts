import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type AmbientDirectorPlugin from "./main";

export const PANEL_VIEW_TYPE = "ambient-director-panel";

/** Height of the little toolbar above the embedded panel, in px. */
const BAR_HEIGHT = 34;

/**
 * Hosts the full control panel inside an Obsidian pane, so scenes can be driven from the same
 * window as the session notes (handy on a laptop). It embeds the app in an <iframe> pointed at the
 * configured server address. A small toolbar can reload it or pop it out to the system browser.
 *
 * An <iframe> (rather than an Electron <webview>) is used deliberately: it sizes reliably and, for a
 * localhost / same-machine server, isn't blocked by mixed-content policy. A remote LAN-IP http server
 * may be refused by the browser — see the "Open in browser" button and the PWA note in the README.
 */
export class PanelView extends ItemView {
  private frame: HTMLIFrameElement | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: AmbientDirectorPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return PANEL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Ambient Director";
  }

  getIcon(): string {
    return "dice-6";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    this.frame = null;
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("sm-panel-view");
    // Layout is set inline (not just in styles.css) so the pane fills correctly even if an older
    // styles.css is still installed — the <webview> otherwise collapses to its 150px intrinsic height.
    Object.assign(root.style, { position: "relative", height: "100%", padding: "0", overflow: "hidden" });

    const base = this.plugin.settings.baseUrl?.trim();
    if (!base) {
      root.createDiv({
        cls: "sm-panel-empty",
        text: "Set the server address in Ambient Director settings, then reopen this panel.",
      });
      return;
    }

    const bar = root.createDiv({ cls: "sm-panel-bar" });
    Object.assign(bar.style, { position: "absolute", top: "0", left: "0", right: "0", height: `${BAR_HEIGHT}px` });
    bar.createSpan({ cls: "sm-panel-title", text: "Control panel" });
    bar.createSpan({ cls: "sm-panel-spacer" });

    const reload = bar.createEl("button", { cls: "sm-panel-btn", attr: { "aria-label": "Reload" } });
    setIcon(reload, "rotate-ccw");
    reload.onclick = () => this.reload();

    const external = bar.createEl("button", { cls: "sm-panel-btn", attr: { "aria-label": "Open in browser" } });
    setIcon(external, "external-link");
    external.onclick = () => window.open(base, "_blank");

    const host = root.createDiv({ cls: "sm-panel-frame" });
    Object.assign(host.style, { position: "absolute", top: `${BAR_HEIGHT}px`, left: "0", right: "0", bottom: "0" });

    const iframe = host.createEl("iframe", { cls: "sm-panel-embed" });
    Object.assign(iframe.style, { position: "absolute", inset: "0", width: "100%", height: "100%", border: "0" });
    iframe.setAttribute("allow", "autoplay; clipboard-write");
    iframe.src = base;
    this.frame = iframe;
  }

  private reload(): void {
    const base = this.plugin.settings.baseUrl?.trim();
    if (!base || !this.frame) return;
    this.frame.src = base; // reassigning src reloads the iframe
  }
}
