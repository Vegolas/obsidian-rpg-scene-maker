import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type AmbientDirectorPlugin from "./main";

export type RenderStyle = "chip" | "banner";

export interface AmbientDirectorSettings {
  /** Base URL of the Ambient Director API, e.g. http://192.168.1.20:5252 */
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

export const DEFAULT_SETTINGS: AmbientDirectorSettings = {
  baseUrl: "http://localhost:5252",
  apiKey: "",
  showThumbnails: true,
  render: "chip",
  highlightActive: true,
};

/*
 * Minimal local typings for Obsidian 1.13+'s declarative settings API. The bundled
 * obsidian typings are pinned to 1.5.7 (our minAppVersion) and don't declare these yet,
 * so we model only the definition kinds this tab uses. A `control` row binds a settings
 * key and Obsidian reads/writes/persists it for us; a `render` row hands us the Setting
 * to wire up imperatively (used where we need a masked field or a plain button).
 */
type TextSettingKey = "baseUrl" | "apiKey";
type ToggleSettingKey = "showThumbnails" | "highlightActive";
type DropdownSettingKey = "render";

type ControlDefinition =
  | { type: "text"; key: TextSettingKey; placeholder?: string; defaultValue?: string }
  | { type: "toggle"; key: ToggleSettingKey; defaultValue?: boolean }
  | { type: "dropdown"; key: DropdownSettingKey; options: Record<string, string>; defaultValue?: RenderStyle };

interface ControlSettingDefinition {
  name: string;
  desc?: string;
  control: ControlDefinition;
}

interface RenderSettingDefinition {
  name: string;
  desc?: string;
  render: (setting: Setting) => void;
}

type SettingDefinition = ControlSettingDefinition | RenderSettingDefinition;

export class AmbientDirectorSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: AmbientDirectorPlugin,
  ) {
    super(app, plugin);
  }

  /**
   * Declarative settings for Obsidian 1.13+. Returning these makes every row show up in
   * the global settings search; on 1.13+ Obsidian renders from here and skips display().
   * `control` rows are auto-persisted by Obsidian; rows that need a masked input or a plain
   * button use `render` to wire the control themselves.
   */
  getSettingDefinitions(): SettingDefinition[] {
    return [
      {
        name: "Server address",
        desc: "Base URL of the Ambient Director API on your LAN, e.g. http://192.168.1.20:5252",
        control: { type: "text", key: "baseUrl", placeholder: "http://localhost:5252", defaultValue: DEFAULT_SETTINGS.baseUrl },
      },
      {
        name: "API key",
        desc: "Only needed if Security:ApiKey is set on the server. Stored in this vault's plugin data — never written into note text.",
        render: (setting) => this.renderApiKey(setting),
      },
      {
        name: "Button style",
        desc: "Chip: a compact inline button. Banner: a full-width bar with the tile art as its background — best when the token sits on its own line. Reopen a note to apply.",
        control: {
          type: "dropdown",
          key: "render",
          options: { chip: "Chip (inline)", banner: "Banner (full width)" },
          defaultValue: DEFAULT_SETTINGS.render,
        },
      },
      {
        name: "Show tile art",
        desc: "Show an entity's uploaded art on its button — a thumbnail (chip) or the background (banner). Falls back to its emoji.",
        control: { type: "toggle", key: "showThumbnails", defaultValue: DEFAULT_SETTINGS.showThumbnails },
      },
      {
        name: "Highlight what's live",
        desc: "Poll the server and mark a button while its scene/event/sound is currently active — even if it was started elsewhere.",
        control: { type: "toggle", key: "highlightActive", defaultValue: DEFAULT_SETTINGS.highlightActive },
      },
      {
        name: "Test connection",
        desc: "Fetch the scene list from the server to confirm the address and key work.",
        render: (setting) => this.renderTestButton(setting),
      },
    ];
  }

  /**
   * Fallback for Obsidian < 1.13, which never calls getSettingDefinitions(). Renders the
   * same definitions imperatively so the two paths can't drift.
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    for (const def of this.getSettingDefinitions()) {
      const setting = new Setting(containerEl).setName(def.name);
      if (def.desc) setting.setDesc(def.desc);
      if ("render" in def) def.render(setting);
      else this.applyControl(setting, def.control);
    }
  }

  /** Wire an imperative control from a declarative descriptor — the pre-1.13 code path. */
  private applyControl(setting: Setting, control: ControlDefinition): void {
    const { plugin } = this;
    switch (control.type) {
      case "text": {
        const { key, placeholder } = control;
        setting.addText((t) => {
          if (placeholder) t.setPlaceholder(placeholder);
          t.setValue(plugin.settings[key]).onChange(async (v) => {
            plugin.settings[key] = v;
            await plugin.saveSettings();
          });
        });
        break;
      }
      case "toggle": {
        const { key } = control;
        setting.addToggle((t) =>
          t.setValue(plugin.settings[key]).onChange(async (v) => {
            plugin.settings[key] = v;
            await plugin.saveSettings();
          }),
        );
        break;
      }
      case "dropdown": {
        const { key, options } = control;
        setting.addDropdown((d) => {
          for (const [value, label] of Object.entries(options)) d.addOption(value, label);
          d.setValue(plugin.settings[key]).onChange(async (v) => {
            plugin.settings[key] = v as RenderStyle;
            await plugin.saveSettings();
          });
        });
        break;
      }
    }
  }

  private renderApiKey(setting: Setting): void {
    const { plugin } = this;
    setting.addText((t) => {
      t.inputEl.type = "password";
      t.setPlaceholder("(none)")
        .setValue(plugin.settings.apiKey)
        .onChange(async (v) => {
          plugin.settings.apiKey = v.trim();
          await plugin.saveSettings();
        });
    });
  }

  private renderTestButton(setting: Setting): void {
    const { plugin } = this;
    setting.addButton((b) =>
      b.setButtonText("Test").onClick(async () => {
        plugin.api.clearCache();
        const scenes = await plugin.api.list("scene", true);
        if (scenes.length > 0) new Notice(`Ambient Director: connected — ${scenes.length} scene(s) found.`);
        else new Notice("Ambient Director: no scenes returned. Check the address/key and that the server is running.");
      }),
    );
  }
}
