import {
	App,
	ButtonComponent,
	Modal,
	Notice,
	Setting,
	TextComponent,
} from 'obsidian'
import EGVPlugin from './main'

export class EGVModal extends Modal {
	plugin: EGVPlugin
	filename: string

	constructor(app: App, plugin: EGVPlugin) {
		super(app)
		this.plugin = plugin
	}

	onOpen() {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass('egv-export-modal')

		const fileRow = contentEl.createDiv({ cls: 'egv-file-row' })

		const fileNameSetting = new Setting(fileRow)
			.setName('File name')
			.setClass('egv-filename-setting')

		const fileInput = new TextComponent(fileNameSetting.controlEl)
			.setValue(this.filename)
			.onChange((value) => (this.filename = value))

		const exportButton = new ButtonComponent(fileRow)
			.setButtonText('Export')
			.setCta()
			.onClick(() => this.export())

		// Graph type section with radio buttons instead of toggles
		const graphTypeSection = contentEl.createDiv({ cls: 'egv-section' })
		graphTypeSection.createEl('h3', { text: 'Graph type' })

		// Use radio buttons instead of toggles for mutually exclusive options
		const graphTypeRadioGroup = new Setting(graphTypeSection)
			.setName('Graph scope')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('fullGraph', 'Full graph')
					.addOption('singleGraph', 'Single parent graph')
					.setValue(this.plugin.settings.viewMode || 'notSet')
					.onChange(async (value) => {
						this.plugin.settings.viewMode = value as
							| 'fullGraph'
							| 'singleGraph'
						await this.plugin.saveSettings()
						// Redraw the appropriate options section
						this.strategy(graphTypeSection)
					})
			)

		// Add the appropriate options section based on current selection
		this.strategy(graphTypeSection)

		// Format settings
		const formatSection = contentEl.createDiv({ cls: 'egv-section' })
		formatSection.createEl('h3', { text: 'Format settings' })

		new Setting(formatSection)
			.setName('Export format')
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
						this.mmdOrDot(formatSection)
					})
			)

		this.mmdOrDot(formatSection)
	}

	strategy(container: HTMLElement) {
		const content = container.querySelector('.options-div')
		if (content) content.remove()

		const options = container.createDiv({
			cls: 'options-div',
		})

		if (this.plugin.settings.viewMode === 'singleGraph') {
			// Single root options
			new Setting(options)
				.setName('Parent type')
				.addDropdown((dropdown) =>
					dropdown
						.addOption('singleTag', 'Tag')
						.addOption('singleNote', 'Note')
						.setValue(this.plugin.settings.relationshipStrategy)
						.onChange(async (value) => {
							this.plugin.settings.relationshipStrategy =
								value as 'singleTag' | 'singleNote'
							await this.plugin.saveSettings()
							this.singleOrFull(options)
						})
				)

			this.singleOrFull(options)
		} else {
			// Full vault options
			new Setting(options)
				.setName('Relationship type')
				.addDropdown((dropdown) =>
					dropdown
						.addOption('tags', 'By tags')
						.addOption('internalLinks', 'By links')
						.addOption('folders', 'By folders')
						.setValue(this.plugin.settings.relationshipStrategy)
						.onChange(async (value) => {
							this.plugin.settings.relationshipStrategy =
								value as 'tags' | 'internalLinks' | 'folders'
							await this.plugin.saveSettings()
						})
				)

			new Setting(options)
				.setName('Include orphans')
				.setDesc('Include notes with no relationships to other notes')
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.includeOrphans)
						.onChange(async (value) => {
							this.plugin.settings.includeOrphans = value
							await this.plugin.saveSettings()
						})
				)
		}
	}

	singleOrFull(container: HTMLElement) {
		const content = container.querySelector('.single-diplay-div')
		if (content) content.remove()

		const rootSelection = container.createDiv({ cls: 'single-display-div' })

		if (this.plugin.settings.relationshipStrategy === 'singleTag') {
			new Setting(rootSelection)
				.setName('Parent tag')
				.setDesc('Enter tag without #')
				.addText((text) =>
					text
						.setValue(this.plugin.settings.rootTag || '')
						.onChange(async (value) => {
							this.plugin.settings.rootTag = value
							await this.plugin.saveSettings()
						})
				)
		} else {
			new Setting(rootSelection)
				.setName('Parent note')
				.setDesc('Enter note title')
				.addText((text) =>
					text
						.setValue(this.plugin.settings.rootNote || '')
						.onChange(async (value) => {
							this.plugin.settings.rootNote = value
							await this.plugin.saveSettings()
						})
				)
		}
	}

	mmdOrDot(container: HTMLElement) {
		const content = container.querySelector('.format-div')
		if (content) content.remove()

		const formatOptions = container.createDiv({ cls: 'format-div' })

		if (this.plugin.settings.exportFormat === 'mmd') {
			new Setting(formatOptions)
				.setName('Mermaid layout')
				.addDropdown((dropdown) =>
					dropdown
						.addOption('TD', 'Top down')
						.addOption('BT', 'Bottom to top')
						.addOption('LR', 'Left to right')
						.addOption('RL', 'Right to left')
						.setValue(this.plugin.settings.direction || 'TD')
						.onChange(async (value) => {
							this.plugin.settings.direction = value as
								| 'TD'
								| 'BT'
								| 'LR'
								| 'RL'
							await this.plugin.saveSettings()
						})
				)
		} else if (this.plugin.settings.exportFormat === 'dot') {
			new Setting(formatOptions)
				.setName('Weight threshold')
				.setDesc(
					'Only include important relationships with a minimum score'
				)
				.addSlider((slider) =>
					slider
						.setLimits(1, 10, 1)
						.setValue(this.plugin.settings.weightThreshold || 10)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.weightThreshold = value
							await this.plugin.saveSettings()
						})
				)

			new Setting(formatOptions)
				.setName('Use subgraphs')
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.subgraphs || false)
						.onChange(async (value) => {
							this.plugin.settings.subgraphs = value
							await this.plugin.saveSettings()
						})
				)
		}
	}

	export() {
		if (!this.filename) {
			new Notice('Please enter a filename')
			return
		}

		this.plugin.exportGraph(this.filename)
		this.close()
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}
