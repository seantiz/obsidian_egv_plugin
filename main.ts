import { DEFAULT_SET } from 'schema'
import { EGVSettingTab } from 'settings'
import { EGVModal } from 'views'
import { VaultWhisperer } from 'whisperer'
import type { EGVSettings, Graph, GraphNode, NodeRelationship } from 'schema'
import {
	App,
	Plugin,
	Notice,
	MetadataCache,
	normalizePath,
	Vault,
} from 'obsidian'

export default class EGVPlugin extends Plugin {
	settings: EGVSettings
	whisperer: VaultWhisperer
	app: App

	async onload() {
		await this.loadSettings()

		this.whisperer = new VaultWhisperer(this.app, this.settings)

		this.addRibbonIcon('dot-network', 'Export graph view', () => {
			new EGVModal(this.app, this).open()
		})

		this.addCommand({
			id: 'export-graph',
			name: 'Export graph to file',
			callback: () => {
				new EGVModal(this.app, this).open()
			},
		})

		this.addSettingTab(new EGVSettingTab(this.app, this))
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SET, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}

	// Cycle through graph data and either export API to store file
	async exportGraph(providedFilename: string = '') {
		try {
			const graph = this.whisperer.buildGraph()

			let exportFilename: string
			if (providedFilename) {
				exportFilename = normalizePath(providedFilename)
			} else {
				const vaultName = this.app.vault.getName()
				exportFilename = normalizePath(`${vaultName}-graph-data`)
			}

			this.settings.lastExported = exportFilename
			await this.saveSettings()

			let filenameWithExtension: string
			if (this.settings.exportFormat === 'mmd') {
				filenameWithExtension = await this.exportMermaid(
					graph,
					exportFilename
				)
			} else {
				filenameWithExtension = await this.exportDot(
					graph,
					exportFilename
				)
			}

			new Notice(
				`Success! Exported to ${normalizePath(this.showWhereExported(filenameWithExtension))}`,
				5000
			)

			return filenameWithExtension
		} catch (error) {
			new Notice(`There's a problem: ${error.message}`)
			return null
		}
	}

	async exportMermaid(graph: Graph, basepath: string) {
		const mermaidContent = this.whisperer.runMMDPrinter(graph)
		const filename = normalizePath(`${basepath}.mmd`)
		await this.app.vault.create(filename, mermaidContent)
		return filename
	}

	async exportDot(graph: Graph, basepath: string) {
		const dotContent = this.whisperer.runDotPrinter(graph)
		const filename = normalizePath(`${basepath}.dot`)
		await this.app.vault.create(filename, dotContent)
		return filename
	}

	showWhereExported(userInput: string = ''): string {
		let filename: string
		if (userInput) {
			filename = normalizePath(userInput)
		} else {
			const vault = this.app.vault.getName()
			filename = normalizePath(`${vault}-graph-data`)
		}

		const exportFolder = this.app.vault.getName()
		return `${exportFolder}/${filename}`
	}
}
