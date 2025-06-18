import { App, PluginSettingTab, Setting, ButtonComponent } from 'obsidian'
import EGVPlugin from './main'

export class EGVSettingTab extends PluginSettingTab {
	plugin: EGVPlugin

	constructor(app: App, plugin: EGVPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		if (!this.plugin.settings.viewMode) {
			this.singleOrFull(containerEl)
		} else if (this.plugin.settings.viewMode === 'singleGraph') {
			this.singleGraph(containerEl)
		} else if (this.plugin.settings.viewMode === 'fullGraph') {
			this.fullGraph(containerEl)
		}
	}

	private singleOrFull(containerEl: HTMLElement) {
		const rootDiv = containerEl.createDiv({
			cls: 'egv-choice-container',
		})

		rootDiv.createEl('h2', {
			text: 'Change default settings',
			cls: 'egv-choice-header',
		})

		rootDiv.createEl('p', {
			text: 'Select the focus you want to tweak settings on',
			cls: 'egv-choice-description',
		})

		const cardsContainer = rootDiv.createDiv({
			cls: 'egv-cards-container',
		})

		const singleParentCard = cardsContainer.createDiv({
			cls: 'egv-choice-card',
		})

		singleParentCard.createDiv({
			cls: 'egv-card-icon single-parent-icon',
		})

		singleParentCard.createEl('h3', { text: 'Single-parent focus' })
		singleParentCard.createEl('p', {
			text: 'Snapshot relationships from a single tag or note',
		})

		const singleButton = new ButtonComponent(
			singleParentCard.createDiv({ cls: 'egv-card-button-container' })
		)
			.setButtonText('Change settings')
			.setCta()
			.onClick(async () => {
				this.plugin.settings.viewMode = 'singleGraph'
				await this.plugin.saveSettings()
				this.display()
			})

		const fullGraphCard = cardsContainer.createDiv({
			cls: 'egv-choice-card',
		})

		fullGraphCard.createDiv({
			cls: 'egv-card-icon full-graph-icon',
		})

		fullGraphCard.createEl('h3', { text: 'Full vault focus' })
		fullGraphCard.createEl('p', {
			text: 'Snapshot your vault from a wider angle',
		})

		const fullButton = new ButtonComponent(
			fullGraphCard.createDiv({ cls: 'egv-card-button-container' })
		)
			.setButtonText('Change settings')
			.setCta()
			.onClick(async () => {
				this.plugin.settings.viewMode = 'fullGraph'
				await this.plugin.saveSettings()
				this.display()
			})
	}

	private singleGraph(containerEl: HTMLElement) {
		const headerDiv = containerEl.createDiv({ cls: 'single-div' })

		new ButtonComponent(headerDiv)
			.setIcon('arrow-left')
			.setTooltip('Back to main choices')
			.onClick(async () => {
				this.plugin.settings.viewMode = undefined
				await this.plugin.saveSettings()
				this.display()
			})

		headerDiv.createEl('h2', { text: 'Single parent graph settings' })

		// Single graph strategy selection (tag vs note)
		const singleDiv = containerEl.createDiv({ cls: 'sg-div' })

		new Setting(singleDiv)
			.setName('Parent node type')
			.setDesc(
				'Set your graph to draw from either your chosen tag or chosen note'
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('singleTag', 'Tag')
					.addOption('singleNote', 'Note')
					.setValue(
						this.plugin.settings.relationshipStrategy || 'singleTag'
					)
					.onChange(async (value) => {
						this.plugin.settings.relationshipStrategy = value as
							| 'singleTag'
							| 'singleNote'
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Root selection based on strategy
		if (this.plugin.settings.relationshipStrategy === 'singleTag') {
			new Setting(singleDiv)
				.setName('Parent tag')
				.setDesc(
					'Enter the tag to use as your graph parent (without #)'
				)
				.addText((text) =>
					text
						.setPlaceholder('Enter tag')
						.setValue(this.plugin.settings.rootTag || '')
						.onChange(async (value) => {
							this.plugin.settings.rootTag = value
							await this.plugin.saveSettings()
						})
				)
		} else if (this.plugin.settings.relationshipStrategy === 'singleNote') {
			new Setting(singleDiv)
				.setName('Parent note')
				.setDesc(
					'Enter the title of the note to use as your graph parent'
				)
				.addText((text) =>
					text
						.setPlaceholder('Enter note title')
						.setValue(this.plugin.settings.rootNote || '')
						.onChange(async (value) => {
							this.plugin.settings.rootNote = value
							await this.plugin.saveSettings()
						})
				)
		}

		// Common settings for export format and include attachments
		this.displayFormatSettings(containerEl)
	}

	private fullGraph(containerEl: HTMLElement) {
		// Back button section
		const fgh = containerEl.createDiv({ cls: 'fgh' })

		new ButtonComponent(fgh)
			.setIcon('arrow-left')
			.setTooltip('Back to main choices')
			.onClick(async () => {
				this.plugin.settings.viewMode = undefined
				await this.plugin.saveSettings()
				this.display()
			})

		fgh.createEl('h2', { text: 'Full graph settings' })

		// Full graph specific settings
		const fullDiv = containerEl.createDiv({ cls: 'full-div' })

		new Setting(fullDiv)
			.setName('Relationship between notes')
			.setDesc('Choose how your notes are organised')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('tags', 'by tags')
					.addOption('internalLinks', 'by internal links')
					.addOption('folders', 'by folders')
					.setValue(
						this.plugin.settings.relationshipStrategy || 'tags'
					)
					.onChange(async (value) => {
						this.plugin.settings.relationshipStrategy = value as
							| 'tags'
							| 'internalLinks'
							| 'folders'
						await this.plugin.saveSettings()
						this.display()
					})
			)

		new Setting(fullDiv)
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

		// Common settings for export format and type filters
		this.displayFormatSettings(containerEl)
	}

	private displayFormatSettings(containerEl: HTMLElement) {
		const formsetdiv = containerEl.createDiv({ cls: 'formset-div' })
		formsetdiv.createEl('h3', { text: 'Export format settings' })

		new Setting(formsetdiv)
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

		new Setting(formsetdiv)
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

		new Setting(formsetdiv)
			.setName('Include relationship weights')
			.setDesc(
				'Store relationship importance metadata in the exported file'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeWeights)
					.onChange(async (value) => {
						this.plugin.settings.includeWeights = value
						await this.plugin.saveSettings()
					})
			)

		if (this.plugin.settings.exportFormat === 'dot') {
			this.displayDotSettings(formsetdiv)
		} else if (this.plugin.settings.exportFormat === 'mmd') {
			this.displayMermaidSettings(formsetdiv)
		}
	}

	private displayDotSettings(containerEl: HTMLElement) {
		const dotsetdiv = containerEl.createDiv({ cls: 'dotsetdiv' })
		dotsetdiv.createEl('h4', { text: 'DOT format settings' })

		new Setting(dotsetdiv)
			.setName('Weight threshold')
			.setDesc(
				'Only include important relationships above a minimum score'
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 10, 1)
					.setValue(this.plugin.settings.weightThreshold || 0)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.weightThreshold = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(dotsetdiv)
			.setName('Subgraph clustering')
			.setDesc('Whether to cluster notes by their common tag or folder')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.subgraphs || false)
					.onChange(async (value) => {
						this.plugin.settings.subgraphs = value
						await this.plugin.saveSettings()
					})
			)
	}

	private displayMermaidSettings(containerEl: HTMLElement) {
		const mmdsetdiv = containerEl.createDiv({ cls: 'mmdsetdiv' })
		mmdsetdiv.createEl('h4', { text: 'Mermaid settings' })

		new Setting(mmdsetdiv)
			.setName('Direction')
			.setDesc('Mermaid layout')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('TD', 'Top down')
					.addOption('LR', 'Left right')
					.addOption('RL', 'Right left')
					.addOption('BT', 'Bottom top')
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

		new Setting(mmdsetdiv)
			.setName('Max relationships per node')
			.setDesc(
				'Optionally limit the number of relationships to render on elements'
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 20, 1)
					.setValue(this.plugin.settings.maxEPerV || 0)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxEPerV = value
						await this.plugin.saveSettings()
					})
			)

		if (this.plugin.settings.viewMode !== 'singleGraph') {
			this.backoffStrategy(mmdsetdiv)
		}
	}

	private backoffStrategy(containerEl: HTMLElement) {
		const backoff = containerEl.createDiv({ cls: 'backoff-div' })

		// Main auto graph reduction toggle
		new Setting(backoff)
			.setName('Enable auto graph reduction')
			.setDesc(
				'NOTE: Turning this off may produce unreadable Mermaid graphs'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableAutoBridge)
					.onChange(async (value) => {
						this.plugin.settings.enableAutoBridge = value
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Only show manual limits section if auto reduction is enabled
		if (this.plugin.settings.enableAutoBridge === true) {
			// Manual limits opt-in toggle
			new Setting(backoff)
				.setName('Manual limit configuration')
				.setDesc(
					'Enable manual configuration of graph limits (advanced)'
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.manualBackoff || false)
						.onChange(async (value) => {
							this.plugin.settings.manualBackoff = value
							await this.plugin.saveSettings()
							this.display()
						})
				)

			// Only show individual limit controls if manual limits are enabled
			if (this.plugin.settings.manualBackoff === true) {
				new Setting(backoff)
					.setName('Max elements')
					.setDesc('Limit the number of elements included')
					.addSlider((slider) =>
						slider
							.setLimits(10, 100, 5)
							.setValue(
								Math.min(
									this.plugin.settings.maxNodes || 40,
									100
								)
							)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.maxNodes = value
								await this.plugin.saveSettings()
							})
					)

				new Setting(backoff)
					.setName('Max relationships')
					.setDesc('Limit the relationships included')
					.addSlider((slider) =>
						slider
							.setLimits(10, 75, 5)
							.setValue(
								Math.min(
									this.plugin.settings.maxRelationships || 60,
									75
								)
							)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.maxRelationships = value
								await this.plugin.saveSettings()
							})
					)

				new Setting(backoff)
					.setName('Max tags')
					.setDesc('Limit the number of tags included')
					.addSlider((slider) =>
						slider
							.setLimits(5, 50, 1)
							.setValue(
								Math.min(this.plugin.settings.maxTags || 10, 50)
							)
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
