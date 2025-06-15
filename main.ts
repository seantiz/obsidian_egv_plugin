import { App, Plugin, Notice, MetadataCache, normalizePath } from 'obsidian'
import {
	type EGVSettings,
	type Graph,
	type LinkMetadata,
	DEFAULT_SETTINGS,
} from 'schema'
import { EGVSettingTab } from 'settings'
import { EGVModal } from 'views'

function cleanId(id: string) {
	return id.replace(/[^a-zA-Z0-9]/g, '_')
}

function safeEscape(label: string) {
	return label.replace(/"/g, '\\"')
}

export default class EGVPlugin extends Plugin {
	settings: EGVSettings
	whisperer: VaultWhisper
	app: App

	async onload() {
		await this.loadSettings()

		this.whisperer = new VaultWhisper(this.app, this.settings)

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
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		)
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}

	// Cycle through graph data and either export API to store file
	async exportGraph(providedFilename: string = '') {
		try {
			const graph = this.whisperer.makeNewGraph()

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
		const mermaidContent = this.whisperer.convertToMermaid(graph)
		const filename = normalizePath(`${basepath}.mmd`)
		await this.app.vault.create(filename, mermaidContent)
		return filename
	}

	async exportDot(graph: Graph, basepath: string) {
		const dotContent = this.whisperer.convertToDot(graph)
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

class VaultWhisper {
	private app: App
	private settings: EGVSettings

	constructor(sharedApp: App, sharedSettings: EGVSettings) {
		this.app = sharedApp
		this.settings = sharedSettings
	}

	// Patch into the Vault environment through vault.getMarkdownFiles()
	makeNewGraph() {
		const cache: MetadataCache = this.app.metadataCache
		const vault = this.app.vault
		const nodes = new Map()
		const links: LinkMetadata[] = []

		const notes = vault.getMarkdownFiles()
		const notesWithRelationships = new Map<string, boolean>()

		// Short cycle to find relationships between notes
		for (const source in cache.resolvedLinks) {
			const linkedNotes = cache.resolvedLinks[source]
			if (Object.keys(linkedNotes).length > 0) {
				notesWithRelationships.set(source, true)
				for (const target in linkedNotes) {
					notesWithRelationships.set(target, true)
				}
			}
		}

		// Cycle through top-level node making for each note in the vault
		for (const note of notes) {
			if (nodes.size >= this.settings.maxNodes) break

			if (
				!this.settings.includeOrphans &&
				!notesWithRelationships.get(note.path)
			) {
				continue
			}

			nodes.set(note.path, {
				id: normalizePath(note.path),
				name: note.basename,
				type: 'note',
			})
		}

		// Cycle through vault attachments if settings allow
		if (
			this.settings.includeAttachments &&
			nodes.size < this.settings.maxNodes
		) {
			vault.getFiles().forEach((file) => {
				if (file.extension !== 'md' && !nodes.has(file.path)) {
					if (nodes.size >= this.settings.maxNodes) return

					nodes.set(file.path, {
						id: normalizePath(file.path),
						name: file.basename,
						type: 'attachment',
					})
				}
			})
		}

		// Make a signalsJS-like graph, no circular relationships between links
		for (const source in cache.resolvedLinks) {
			if (!nodes.has(source)) continue

			const linkedNotes = cache.resolvedLinks[source]
			for (const target in linkedNotes) {
				// DAG enforcement - skip self-references
				if (source === target) continue

				if (nodes.has(target)) {
					// Optional weight metadata
					const linkStrength = linkedNotes[target]

					links.push({
						source: source,
						target: target,
						weight: linkStrength,
					})
				}
			}
		}

		return {
			nodes: Array.from(nodes.values()),
			links: links,
		}
	}

	convertToMermaid(graph: Graph) {
		let mermaid = 'graph TD\n'

		graph.nodes.forEach((node) => {
			const nodeId = cleanId(node.id)
			const nodeStyle =
				node.type === 'attachment' ? 'style=fill,stroke:#ff9900' : ''

			mermaid += `    ${nodeId}["${safeEscape(node.name)}"]${nodeStyle ? ' ' + nodeStyle : ''}\n`
		})

		// Add links
		graph.links.forEach((link) => {
			const sourceId = cleanId(link.source)
			const targetId = cleanId(link.target)
			mermaid += `    ${sourceId} --> ${targetId}\n`
		})

		return mermaid
	}

	convertToDot(graph: Graph) {
		const vaultName = this.app.vault.getName()
		let dot = `digraph ${vaultName} {\n`
		dot += '    rankdir=LR;\n'
		dot += '    node [shape=box, style=rounded];\n'

		graph.nodes.forEach((node) => {
			const nodeId = cleanId(node.id)
			const nodeStyle =
				node.type === 'attachment'
					? 'fillcolor="#ffcc80", style="filled,rounded"'
					: 'fillcolor="#e3f2fd", style="filled,rounded"'

			dot += `    "${nodeId}" [label="${safeEscape(node.name)}", ${nodeStyle}];\n`
		})

		graph.links.forEach((link) => {
			const sourceId = cleanId(link.source)
			const targetId = cleanId(link.target)
			// Optional relationship weights in .dot exports
			const weightAttr =
				this.settings.includeWeights && link.weight > 1
					? ` [weight=${link.weight}]`
					: ''
			dot += `    "${sourceId}" -> "${targetId}"${weightAttr};\n`
		})

		return dot
	}
}
