import EGVPlugin from 'src/main'
import { EGVModal } from 'src/views'
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
			.setDesc('Whether to include any non-markdown files by default')
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
			.setDesc('Choose how your notes are organised')
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
						this.display()
					})
			)

		new Setting(containerEl)
			.setName('Include edge weights')
			.setDesc(
				'Include relationship-strength metadata between elements in export file'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeWeights)
					.onChange(async (value) => {
						this.plugin.settings.includeWeights = value
						await this.plugin.saveSettings()
					})
			)

		// Either Some Dot or Some MMD
		if (this.plugin.settings.exportFormat === 'dot') {
			this.displayDotSettings(containerEl)
		} else if (this.plugin.settings.exportFormat === 'mmd') {
			this.displayMermaidSettings(containerEl)
		}
	}

	// Some DOT
	private displayDotSettings(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName('Weight threshold')
			.setDesc(
				'Minimum score for a relationship to be included in the graph.'
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
	}

	// Some MMD
	private displayMermaidSettings(containerEl: HTMLElement) {
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
			.setName('Max relationships per note')
			.setDesc('Limit relationships per note to reduce visual clutter')
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

		// Some MMD(Strategy(tag-based))
		if (this.plugin.settings.relationshipStrategy === 'tags') {
			new Setting(containerEl)
				.setName('Turn off automatic graph reduction')
				.setDesc(
					'NOTE: Turning this off may produce unreadable diagrams in Mermaid editors'
				)
				.addToggle((toggle) =>
					toggle
						.setValue(
							this.plugin.settings.disableAutoBridging || false
						)
						.onChange(async (value) => {
							this.plugin.settings.disableAutoBridging = value
							await this.plugin.saveSettings()
							this.display()
						})
				)

			// Some MMD(Strategy(tag-based) && auto-bridging disabled)
			if (this.plugin.settings.disableAutoBridging) {
				containerEl.createEl('h4', {
					text: 'Set manual limits',
					cls: 'bridging-desc',
				})

				new Setting(containerEl)
					.setName('Maximum nodes')
					.setDesc('Maximum number of nodes in diagram')
					.addSlider((slider) =>
						slider
							.setLimits(10, 100, 5)
							.setValue(this.plugin.settings.maxNodes || 40)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.maxNodes = value
								await this.plugin.saveSettings()
							})
					)

				new Setting(containerEl)
					.setName('Maximum relationships')
					.setDesc('Maximum number of relationships')
					.addSlider((slider) =>
						slider
							.setLimits(10, 150, 5)
							.setValue(
								this.plugin.settings.maxRelationships || 60
							)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.maxRelationships = value
								await this.plugin.saveSettings()
							})
					)

				new Setting(containerEl)
					.setName('Maximum tags')
					.setDesc('Maximum number of tags')
					.addSlider((slider) =>
						slider
							.setLimits(3, 30, 1)
							.setValue(this.plugin.settings.maxTags || 10)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.maxTags = value
								await this.plugin.saveSettings()
							})
					)
			}
		}
	}
}
