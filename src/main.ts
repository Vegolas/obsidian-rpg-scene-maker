import { MarkdownPostProcessorContext, Notice, Plugin } from "obsidian";
import { AmbientDirectorApi } from "./api";
import { buildChip } from "./chip";
import { livePreviewExtension } from "./livepreview";
import { AmbientDirectorSuggest } from "./suggest";
import { PANEL_VIEW_TYPE, PanelView } from "./panelview";
import { DEFAULT_SETTINGS, AmbientDirectorSettingTab, AmbientDirectorSettings } from "./settings";
import { StateTracker } from "./tracker";
import { SmToken, parseToken, pathFor } from "./tokens";

/** How often to poll the server for live active state (ms), while chips are on screen. */
const POLL_INTERVAL_MS = 4000;

export default class AmbientDirectorPlugin extends Plugin {
  settings!: AmbientDirectorSettings;
  api!: AmbientDirectorApi;
  tracker!: StateTracker;

  // Component.onload is typed void (through Obsidian 1.5.x), so the async part runs fire-and-forget;
  // every registration below is Component-tracked, so an unload during the (one disk read) settings
  // load still cleans up correctly.
  onload(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.loadSettings();
    this.api = new AmbientDirectorApi(() => ({ baseUrl: this.settings.baseUrl, apiKey: this.settings.apiKey }));
    this.tracker = new StateTracker(this);
    this.registerInterval(window.setInterval(() => void this.tracker.tick(), POLL_INTERVAL_MS));

    this.addSettingTab(new AmbientDirectorSettingTab(this.app, this));

    // Reading view: turn inline `sm:...` code spans into chips.
    this.registerMarkdownPostProcessor((el, ctx) => this.renderReadingChips(el, ctx));

    // Live Preview: same chips inline while editing.
    this.registerEditorExtension(livePreviewExtension(this));

    // Authoring: autocomplete kinds and existing scene/event/sound ids.
    this.registerEditorSuggest(new AmbientDirectorSuggest(this.app, this));

    // Control panel embedded in an Obsidian pane (drive scenes from the notes window).
    this.registerView(PANEL_VIEW_TYPE, (leaf) => new PanelView(leaf, this));
    this.addRibbonIcon("dice-6", "Open Ambient Director panel", () => void this.activatePanel());
    this.addCommand({
      id: "open-panel",
      name: "Open control panel",
      callback: () => void this.activatePanel(),
    });

    this.addCommand({
      id: "refresh-lists",
      name: "Refresh scene / event / sound lists",
      callback: () => {
        this.api.clearCache();
        new Notice("Ambient Director: lists refreshed.");
      },
    });
  }

  /** Open (or reveal) the embedded control-panel pane. */
  private async activatePanel(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(PANEL_VIEW_TYPE);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type: PANEL_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  private renderReadingChips(el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    el.findAll("code").forEach((code) => {
      // Only inline code — never fenced code blocks (which render as <code> inside <pre>).
      if (code.parentElement?.tagName === "PRE") return;
      const token = parseToken(code.textContent);
      if (!token) return;
      code.replaceWith(buildChip(this, token));
    });
  }

  /** Fire a token's command and show a toast with the result. */
  async fire(token: SmToken): Promise<void> {
    const name = token.label ?? token.arg ?? token.kind;
    const res = await this.api.fire(pathFor(token));
    if (res.ok) {
      new Notice(`▶ ${name}`);
      // Reflect the change quickly instead of waiting for the next poll tick.
      window.setTimeout(() => void this.tracker.refresh(), 400);
    } else {
      new Notice(`⚠ ${name}: ${res.message ?? "failed"}`);
    }
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<AmbientDirectorSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
