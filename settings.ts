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

		// Root
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
						this.display()
					})
			)

		new Setting(containerEl)
			.setName('Include orphan notes')
			.setDesc(
				'Whether to include notes with no relationship to other notes by default'
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
			.setName('Relationship between notes')
			.setDesc('Choose how notes are organised')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('tags', 'by tags')
					.addOption('internalLinks', 'by internal links')
					.addOption('folders', 'by folders')
					.setValue(this.plugin.settings.relationshipStrategy)
					.onChange(async (value) => {
						this.plugin.settings.relationshipStrategy = value as
							| 'tags'
							| 'internalLinks'
							| 'folders'
						await this.plugin.saveSettings()
					})
			)

		// Either dot
		if (this.plugin.settings.exportFormat === 'dot') {
			new Setting(containerEl)
				.setName('Include edge weights')
				.setDesc(
					'For rendering the strength of links between notes in editors like Gephi.'
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.includeWeights)
						.onChange(async (value) => {
							this.plugin.settings.includeWeights = value
							await this.plugin.saveSettings()
						})
				)

			new Setting(containerEl)
				.setName('Weight threshold')
				.setDesc(
					'Minimum weight for a relationship to be included in the graph.'
				)
				.addSlider((slider) =>
					slider
						.setLimits(1, 10, 1)
						.setValue(this.plugin.settings.weightThreshold || 1)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.weightThreshold = value
							await this.plugin.saveSettings()
						})
				)

			new Setting(containerEl)
				.setName('Enable subgraphs')
				.setDesc('Group nodes into subgraphs based on relationships.')
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.subgraphs || false)
						.onChange(async (value) => {
							this.plugin.settings.subgraphs = value
							await this.plugin.saveSettings()
						})
				)

			// Either mermaid
		} else if (this.plugin.settings.exportFormat === 'mmd') {
			new Setting(containerEl)
				.setName('Graph direction')
				.setDesc('Choose your mermaid layout')
				.addDropdown((dropdown) =>
					dropdown
						.addOption('TD', 'Top to Bottom')
						.addOption('LR', 'Left to Right')
						.addOption('RL', 'Right to Left')
						.addOption('BT', 'Bottom to Top')
						.setValue(this.plugin.settings.direction || 'TD')
						.onChange(async (value) => {
							this.plugin.settings.direction = value as
								| 'TD'
								| 'LR'
								| 'RL'
								| 'BT'
							await this.plugin.saveSettings()
						})
				)

			new Setting(containerEl)
				.setName('Max relationships for each note')
				.setDesc('Use this setting to de-clutter your mermaid chart')
				.addSlider((slider) =>
					slider
						.setLimits(1, 20, 1)
						.setValue(this.plugin.settings.maxEPerV || 8)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.maxEPerV = value
							await this.plugin.saveSettings()
						})
				)
		}
	}
}
