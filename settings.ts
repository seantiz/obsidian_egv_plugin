import EGVPlugin from 'main'
import { EGVModal } from 'views'
import { App, PluginSettingTab, Setting, ButtonComponent } from 'obsidian'

export class EGVSettingTab extends PluginSettingTab {
	private plugin: EGVPlugin

	constructor(app: App, plugin: EGVPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display() {
		const { containerEl } = this
		containerEl.empty()

		new Setting(containerEl)
			.setName('Export format')
			.setDesc('Choose either a .mmd (Mermaid) or .dot (Graphviz) file')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('mmd', '.mmd')
					.addOption('dot', '.dot')
					.setValue(this.plugin.settings.exportFormat)
					.onChange(async (value) => {
						this.plugin.settings.exportFormat = value as
							| 'mmd'
							| 'dot'
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('Include orphan notes')
			.setDesc(
				'Whether to include notes with no links to other notes by default'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeOrphans)
					.onChange(async (value) => {
						this.plugin.settings.includeOrphans = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('Include attachments')
			.setDesc(
				'Whether to include non-markdown files from your vault by default'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeAttachments)
					.onChange(async (value) => {
						this.plugin.settings.includeAttachments = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('Maximum nodes to export')
			.setDesc('This is an optional safeguard against huge vaults.')
			.addSlider((slider) =>
				slider
					.setLimits(100, 5000, 100)
					.setValue(this.plugin.settings.maxNodes)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxNodes = value
						await this.plugin.saveSettings()
					})
			)

		const helpText = containerEl.createEl('p', {
			text: "NOTE: Don't worry too much about max nodes here. The plugin's main view will let you know how many notes and attachments are set to be exported.",
			cls: 'help-text',
		})

		new Setting(containerEl)
			.setName('Include relationship metadata')
			.setDesc(
				'For rendering the strength of links between notes in editors like Gephi. Only applies to .dot files.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeWeights)
					.onChange(async (value) => {
						this.plugin.settings.includeWeights = value
						await this.plugin.saveSettings()
					})
			)

		const buttonContainer = containerEl.createDiv({
			cls: 'settings-button-section',
		})

		const quickExportButton = new ButtonComponent(buttonContainer)
			.setButtonText('Go to plugin')
			.setCta()
			.onClick(() => {
				new EGVModal(this.app, this.plugin).open()
			})
		quickExportButton.setClass('quick-export-button')
	}
}
