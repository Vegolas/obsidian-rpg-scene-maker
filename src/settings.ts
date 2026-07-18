import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type SceneMakerPlugin from "./main";

export type RenderStyle = "chip" | "banner";

export interface SceneMakerSettings {
  /** Base URL of the RPG Scene Maker API, e.g. http://192.168.1.20:5252 */
  baseUrl: string;
  /** Optional API key (only when Security:ApiKey is set on the server). */
  apiKey: string;
  /** Show a scene/event/sound's uploaded art as a thumbnail on its button. */
  showThumbnails: boolean;
  /** Global button style: compact inline chip, or a full-width banner with art as background. */
  render: RenderStyle;
  /** Poll the server and mark a button while its scene/event/sound is live. */
  highlightActive: boolean;
}

export const DEFAULT_SETTINGS: SceneMakerSettings = {
  baseUrl: "http://localhost:5252",
  apiKey: "",
  showThumbnails: true,
  render: "chip",
  highlightActive: true,
};

export class SceneMakerSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: SceneMakerPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Server address")
      .setDesc("Base URL of the RPG Scene Maker API on your LAN, e.g. http://192.168.1.20:5252")
      .addText((t) =>
        t
          .setPlaceholder("http://localhost:5252")
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (v) => {
            this.plugin.settings.baseUrl = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("API key")
      .setDesc(
        "Only needed if Security:ApiKey is set on the server. Stored in this vault's plugin data — never written into note text.",
      )
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("(none)")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (v) => {
            this.plugin.settings.apiKey = v.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Button style")
      .setDesc(
        "Chip: a compact inline button. Banner: a full-width bar with the tile art as its background — best when the token sits on its own line. Reopen a note to apply.",
      )
      .addDropdown((d) =>
        d
          .addOption("chip", "Chip (inline)")
          .addOption("banner", "Banner (full width)")
          .setValue(this.plugin.settings.render)
          .onChange(async (v) => {
            this.plugin.settings.render = v as "chip" | "banner";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Show tile art")
      .setDesc("Show an entity's uploaded art on its button — a thumbnail (chip) or the background (banner). Falls back to its emoji.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showThumbnails).onChange(async (v) => {
          this.plugin.settings.showThumbnails = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Highlight what's live")
      .setDesc("Poll the server and mark a button while its scene/event/sound is currently active — even if it was started elsewhere.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.highlightActive).onChange(async (v) => {
          this.plugin.settings.highlightActive = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Fetch the scene list from the server to confirm the address and key work.")
      .addButton((b) =>
        b.setButtonText("Test").onClick(async () => {
          this.plugin.api.clearCache();
          const scenes = await this.plugin.api.list("scene", true);
          if (scenes.length > 0) new Notice(`RPG Scene Maker: connected — ${scenes.length} scene(s) found.`);
          else new Notice("RPG Scene Maker: no scenes returned. Check the address/key and that the server is running.");
        }),
      );
  }
}
