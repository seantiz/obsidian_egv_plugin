import EGVPlugin from 'src/main'
import { Modal, App, Setting, ButtonComponent, normalizePath } from 'obsidian'

export class EGVModal extends Modal {
	plugin: EGVPlugin
	customFilename: string
	includeOrphans: boolean
	includeAttachments: boolean

	constructor(app: App, plugin: EGVPlugin) {
		super(app)
		this.plugin = plugin
		this.customFilename = plugin.settings.lastExported || ''
		this.includeOrphans = plugin.settings.includeOrphans
		this.includeAttachments = plugin.settings.includeAttachments
	}

	onOpen() {
		const { contentEl } = this

		contentEl.createEl('h2', { text: 'Export graph view' })

		contentEl.createEl('p', {
			text: "All files are exported to your vault's root folder",
			cls: 'root-notice',
		})

		new Setting(contentEl)
			.setName('Filename')
			.setDesc('Enter a name (without extension) for your exported file')
			.addText((text) =>
				text.setValue(this.customFilename).onChange((value) => {
					this.customFilename = normalizePath(value)
				})
			)

		new Setting(contentEl)
			.setName('Include orphaned notes')
			.setDesc('Toggle on to include notes without relationships')
			.addToggle((toggle) =>
				toggle.setValue(this.includeOrphans).onChange((value) => {
					this.includeOrphans = value
				})
			)

		new Setting(contentEl)
			.setName('Include attachments')
			.setDesc(
				'Toggle on to include all non-markdown files from this vault'
			)
			.addToggle((toggle) =>
				toggle.setValue(this.includeAttachments).onChange((value) => {
					this.includeAttachments = value
				})
			)

		const metadataSection = contentEl.createDiv()
		metadataSection.addClass('metadata-section')

		metadataSection.createEl('p', {
			text: `Your vault has ${this.app.vault.getMarkdownFiles().length} markdown files`,
		})

		const connectedCount = this.countConnectedNotes()
		metadataSection.createEl('p', {
			text: `${connectedCount} notes have connections`,
		})

		const buttonContainer = contentEl.createDiv({
			cls: 'view-button-section',
		})

		new ButtonComponent(buttonContainer)
			.setButtonText('Export to file')
			.setCta()
			.setClass('export-button')
			.onClick(async () => {
				this.plugin.settings.includeOrphans = this.includeOrphans
				this.plugin.settings.includeAttachments =
					this.includeAttachments
				await this.plugin.saveSettings()

				const finalpath = await this.plugin.exportGraph(
					normalizePath(this.customFilename)
				)
				if (finalpath) {
					this.close()
				}
			})
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}

	countConnectedNotes(): number {
		const metadataCache = this.app.metadataCache
		const connectedFiles = new Set<string>()

		for (const source in metadataCache.resolvedLinks) {
			const destinations = metadataCache.resolvedLinks[source]
			if (Object.keys(destinations).length > 0) {
				connectedFiles.add(source)

				for (const target in destinations) {
					connectedFiles.add(target)
				}
			}
		}

		return connectedFiles.size
	}
}
