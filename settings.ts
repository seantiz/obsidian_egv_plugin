import EGVPlugin from "main";
import { EGVModal } from "views";
import { App, PluginSettingTab, Setting, ButtonComponent } from "obsidian";

export class EGVSettingTab extends PluginSettingTab {
	private plugin: EGVPlugin;

	constructor(app: App, plugin: EGVPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Export format")
			.setDesc("Choose whether to export as .mmd (Mermaid) or .dot (Graphviz) file")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("mmd", ".mmd")
					.addOption("dot", ".dot")
					.setValue(this.plugin.settings.exportFormat)
					.onChange(async (value) => {
						this.plugin.settings.exportFormat = value as "mmd" | "dot";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Include orphaned notes")
			.setDesc("Default setting - toggle to include notes without relationships every time unless overriden")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.includeOrphans).onChange(async (value) => {
					this.plugin.settings.includeOrphans = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Include attachments")
			.setDesc(
				"Default setting - toggle on to include all non-markdown files in this vault every time unless overriden",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.includeAttachments).onChange(async (value) => {
					this.plugin.settings.includeAttachments = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Maximum nodes to export")
			.setDesc(`Use the slide setting max number of nodes to export - this is a safeguard for huge vaults.`)
			.addSlider((slider) =>
				slider
					.setLimits(100, 5000, 100)
					.setValue(this.plugin.settings.maxNodes)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxNodes = value;
						await this.plugin.saveSettings();
					}),
			);

		const helpText = containerEl.createEl("p", {
			text: "NOTE: The plugin will let you know how many notes and attachments are set to be exported.",
			cls: "help-text",
		});

		const buttonContainer = containerEl.createDiv({ cls: "settings-button-section" });

		const quickExportButton = new ButtonComponent(buttonContainer)
			.setButtonText("Go to plugin")
			.setCta()
			.onClick(() => {
				new EGVModal(this.app, this.plugin).open();
			});
		quickExportButton.setClass("quick-export-button");
	}
}
