import type { EGVSettings, Graph, GraphNode, NodeRelationship } from 'schema'
import {
	type App,
	type Vault,
	type MetadataCache,
	normalizePath,
	TFile,
	TFolder,
} from 'obsidian'

function cleanId(id: string) {
	return id.replace(/[^a-zA-Z0-9]/g, '_')
}

function safeEscape(label: string) {
	return label.replace(/"/g, '\\"')
}

interface VaultEnv {
	cache: MetadataCache
	vault: Vault
	nodes: Map<string, GraphNode>
	relationships: NodeRelationship[]
	settings: EGVSettings
	getN(): number // Total number of notes
	getT(): number // Total number of unique tags
	getK(): number // Average tags per note
	getOptimalN(E_max?: number): number // Calculate optimal note count based on formula
	isPastSingularity(E_max?: number): boolean // Check if we're hitting Mermaid limits
}

export class VaultWhisperer {
	private app: App
	private settings: EGVSettings

	constructor(sharedApp: App, sharedSettings: EGVSettings) {
		this.app = sharedApp
		this.settings = sharedSettings
	}

	/**
	 * Makes new graph object
	 * Populates with (V, E) harvest
	 * Applies (V, E, Format) domain settings
	 * then Returns G
	 **/
	buildGraph(): Graph {
		const graph: Graph = {
			nodes: [] as GraphNode[],
			relationships: [] as NodeRelationship[],
		}

		this.harvestVault(graph)

		if (this.settings.exportFormat === 'dot') {
			this.runDotSettings(graph)
		} else {
			this.runMMDSettings(graph)
		}

		return graph
	}

	// Build up shared vault environment
	private harvestVault(graph: Graph): void {
		const vaultEnv: VaultEnv = {
			cache: this.app.metadataCache,
			vault: this.app.vault,
			nodes: new Map<string, GraphNode>(),
			relationships: [] as NodeRelationship[],
			settings: this.settings,
			getN(): number {
				return Array.from(this.nodes.keys()).filter((key: string) =>
					key.endsWith('.md')
				).length
			},
			getT(): number {
				return Array.from(this.nodes.values()).filter(
					(node: GraphNode) => node.type === 'tag'
				).length
			},
			getK(): number {
				const notesToTags = new Map<string, number>()
				this.relationships.forEach((rel: NodeRelationship) => {
					const targetNode = this.nodes.get(rel.target)
					const sourceNode = this.nodes.get(rel.source)
					if (
						targetNode?.type === 'tag' &&
						sourceNode?.type === 'note'
					) {
						if (!notesToTags.has(rel.source)) {
							notesToTags.set(rel.source, 0)
						}
						notesToTags.set(
							rel.source,
							notesToTags.get(rel.source)! + 1
						)
					}
				})
				const totalTags = Array.from(notesToTags.values()).reduce(
					(sum, count) => sum + count,
					0
				)
				return totalTags / Math.max(1, notesToTags.size)
			},
			getOptimalN(E_max: number = 150): number {
				const t = this.getT()
				const k = this.getK()
				return Math.floor(Math.sqrt((2 * E_max * t) / Math.max(1, k)))
			},
			isPastSingularity(E_max: number = 150): boolean {
				const N = this.getN()
				const T = this.getT()
				const K = this.getK()

				// Calculate actual possible edges based on tag clustering
				let shouldE = 0
				const eTN = new Map<string, string[]>()

				this.relationships.forEach((rel: NodeRelationship) => {
					const targetNode = this.nodes.get(rel.target)
					const sourceNode = this.nodes.get(rel.source)
					if (
						targetNode?.type === 'tag' &&
						sourceNode?.type === 'note'
					) {
						if (!eTN.has(rel.target)) {
							eTN.set(rel.target, [])
						}
						eTN.get(rel.target)!.push(rel.source)
					}
				})

				// Calculate note-to-note edges through shared tags
				eTN.forEach((notes) => {
					if (notes.length > 1) {
						shouldE += (notes.length * (notes.length - 1)) / 2
					}
				})

				// Limits - singularity boundaries
				const maxV = 100 // Max nodes for readable Mermaid
				const maxE = Math.min(E_max, 75) // More relationships
				const maxVAndE = 150 // Max graph elements (nodes + edges)

				return (
					N > maxV ||
					shouldE > maxE ||
					N + shouldE > maxVAndE ||
					T > 50 // Too many tags create visual clutter
				)
			},
		}

		this.reapNotes(vaultEnv)
		this.reapTags(vaultEnv)
		this.reapLinks(vaultEnv)
		this.reapFolders(vaultEnv)

		if (this.settings.includeAttachments) {
			this.clusterAttachments(vaultEnv)
		}

		// Run user-selected strategy on harvest then return the graph
		switch (this.settings.relationshipStrategy) {
			case 'tags':
				this.tagNetwork(vaultEnv)
				break
			case 'internalLinks':
				this.linkNetwork(vaultEnv)
				break
			case 'folders':
				this.plantFolders(vaultEnv)
				break
		}

		graph.nodes = Array.from(vaultEnv.nodes.values())
		graph.relationships = vaultEnv.relationships
	}

	private reapNotes(vaultEnv: VaultEnv): void {
		const allVaultFiles = vaultEnv.vault.getMarkdownFiles()

		for (const file of allVaultFiles) {
			vaultEnv.nodes.set(file.path, {
				id: normalizePath(file.path),
				name: file.basename,
				type: 'note',
			})
		}
	}

	// Builds E clusters where e =(v_note, tag)
	private reapTags(vaultEnv: VaultEnv): void {
		const allVaultFiles = vaultEnv.vault.getMarkdownFiles()
		const tags = new Set<string>()

		for (const file of allVaultFiles) {
			const cache = vaultEnv.cache.getFileCache(file)
			const e: string[] = []

			if (cache?.frontmatter?.tags) {
				const tags = cache.frontmatter.tags
				if (Array.isArray(tags)) {
					e.push(...tags)
				} else if (typeof tags === 'string') {
					e.push(tags)
				}
			}

			// Create tag nodes and relationships
			e.forEach((tag) => {
				tags.add(tag)

				// Create tag node if needed
				if (!vaultEnv.nodes.has(tag)) {
					vaultEnv.nodes.set(tag, {
						id: tag,
						name: tag,
						type: 'tag',
					})
				}

				// Create e
				vaultEnv.relationships.push({
					source: file.path,
					target: tag,
					weight: 1,
				})
			})
		}
	}

	private reapLinks(vaultEnv: VaultEnv): void {
		const allVaultFiles = vaultEnv.vault.getMarkdownFiles()

		for (const file of allVaultFiles) {
			const cache = vaultEnv.cache.getFileCache(file)

			if (cache?.links) {
				cache.links.forEach((link) => {
					const targetFile = vaultEnv.vault.getAbstractFileByPath(
						link.link + '.md'
					)
					if (targetFile && targetFile instanceof TFile) {
						vaultEnv.relationships.push({
							source: file.path,
							target: targetFile.path,
							weight: 1,
						})
					}
				})
			}
		}
	}

	private reapFolders(vaultEnv: VaultEnv): void {
		const allFolders = vaultEnv.vault
			.getAllLoadedFiles()
			.filter((file) => file instanceof TFolder) as TFolder[]

		for (const folder of allFolders) {
			vaultEnv.nodes.set(folder.name, {
				id: folder.name,
				name: folder.name,
				type: 'folder',
			})

			// Create e where e belongs to E as folders
			folder.children.forEach((child) => {
				if (child instanceof TFile && child.extension === 'md') {
					vaultEnv.relationships.push({
						source: child.path,
						target: folder.name,
						weight: 1,
					})
				}
			})
		}
	}

	// Harvest attachments
	private clusterAttachments(vaultEnv: VaultEnv): void {
		const allFiles = vaultEnv.vault.getFiles()

		for (const file of allFiles) {
			if (file.extension !== '.md') {
				vaultEnv.nodes.set(file.path, {
					id: normalizePath(file.path),
					name: file.basename,
					type: 'attachment',
				})

				// Build e as E(notelink, attachment)
				const allVaultFiles = vaultEnv.vault.getMarkdownFiles()
				for (const noteFile of allVaultFiles) {
					const cache = vaultEnv.cache.getFileCache(noteFile)
					if (cache?.embeds) {
						cache.embeds.forEach((embed) => {
							if (
								embed.link === file.path ||
								embed.link === file.basename
							) {
								vaultEnv.relationships.push({
									source: noteFile.path,
									target: file.path,
									weight: 1,
								})
							}
						})
					}
				}
			}
		}
	}

	// Applies Stategy(v,w) as tags and notes given every relationship (v,w) belongs to V
	private tagNetwork(vaultEnv: VaultEnv): void {
		console.log(
			'Before tagNetwork:',
			vaultEnv.nodes.size,
			'nodes,',
			vaultEnv.relationships.length,
			'relationships'
		)

		const vAndW = new Map<string, GraphNode>()
		const e: NodeRelationship[] = []

		// Apply Strategy(v,w) as tags and notes given every relationship (v,w) belongs to V
		vaultEnv.nodes.forEach((node, key) => {
			if (node.type === 'note' || node.type === 'tag') {
				vAndW.set(key, node)
			}
		})

		// Filter relationships to only (note → tag) edges
		vaultEnv.relationships.forEach((rel) => {
			const targetNode = vaultEnv.nodes.get(rel.target)
			const sourceNode = vaultEnv.nodes.get(rel.source)

			if (targetNode?.type === 'tag' && sourceNode?.type === 'note') {
				e.push(rel)
			}
		})

		// Check singularity conditions and apply mitigation
		if (vaultEnv.settings.exportFormat === 'mmd') {
			// Create temporary environment for singularity check
			const tempEnv = {
				...vaultEnv,
				nodes: new Map(vAndW),
				relationships: [...e],
			}

			if (tempEnv.isPastSingularity()) {
				console.log('Singularity detected - applying backoff strategy')
				this.backoffSingularity(vAndW, e, vaultEnv)
			} else {
				console.log('Graph size within acceptable limits')
			}
		}

		// Apply orphan pruning if requested
		if (!vaultEnv.settings.includeOrphans) {
			this.prune(vAndW, e)
		}

		// Final validation
		const finalElements = vAndW.size + e.length
		console.log(
			'After tagNetwork:',
			vAndW.size,
			'nodes,',
			e.length,
			'relationships',
			`(${finalElements} total elements)`
		)

		// Warning if still too large
		if (finalElements > 200) {
			console.warn(
				'Graph may still be too large for optimal Mermaid rendering'
			)
		}

		vaultEnv.nodes = vAndW
		vaultEnv.relationships = e
	}

	// Strategy: Filter for internal links dataviz
	private linkNetwork(vaultEnv: VaultEnv): void {
		// Keep only notes
		const vAndW = new Map<string, GraphNode>()
		const e: NodeRelationship[] = []

		vaultEnv.nodes.forEach((node, key) => {
			if (node.type === 'note') {
				vAndW.set(key, node)
			}
		})

		vaultEnv.relationships.forEach((rel) => {
			const targetNode = vaultEnv.nodes.get(rel.target)
			const sourceNode = vaultEnv.nodes.get(rel.source)

			if (targetNode?.type === 'note' && sourceNode?.type === 'note') {
				e.push(rel)
			}
		})

		if (!vaultEnv.settings.includeOrphans) {
			this.prune(vAndW, e)
		}

		vaultEnv.nodes = vAndW
		vaultEnv.relationships = e
	}

	// Strategy: Filter for folder hierarchy dataviz
	private plantFolders(vaultEnv: VaultEnv): void {
		// Keep notes and folders
		const vAndW = new Map<string, GraphNode>()
		const e: NodeRelationship[] = []

		vaultEnv.nodes.forEach((node, key) => {
			if (node.type === 'note' || node.type === 'folder') {
				vAndW.set(key, node)
			}
		})

		vaultEnv.relationships.forEach((rel) => {
			const targetNode = vaultEnv.nodes.get(rel.target)
			const sourceNode = vaultEnv.nodes.get(rel.source)

			if (targetNode?.type === 'folder' && sourceNode?.type === 'note') {
				e.push(rel)
			}
		})

		if (!vaultEnv.settings.includeOrphans) {
			this.prune(vAndW, e)
		}

		vaultEnv.nodes = vAndW
		vaultEnv.relationships = e
	}

	// Mermaid specific to not tear the mermaid chart
	private backoffSingularity(
		nodes: Map<string, GraphNode>,
		relationships: NodeRelationship[],
		vaultEnv: VaultEnv
	): void {
		// Strict limits for Mermaid rendering
		const MAX_TOTAL_ELEMENTS = 100 // Total nodes + relationships
		const MAX_NODES = 40 // Maximum number of nodes
		const MAX_RELATIONSHIPS = 60 // Maximum number of relationships

		console.log(
			'Performing aggressive graph reduction for Mermaid compatibility'
		)

		// Step 1: Build tag importance metrics
		const tagClusters = new Map<string, string[]>()
		const tagImportance = new Map<string, number>()

		// Group notes by tag
		relationships.forEach((rel) => {
			const targetNode = nodes.get(rel.target)
			if (targetNode?.type === 'tag') {
				if (!tagClusters.has(rel.target)) {
					tagClusters.set(rel.target, [])
				}
				tagClusters.get(rel.target)!.push(rel.source)
			}
		})

		// Calculate tag importance: weighted by cluster size and connectivity potential
		tagClusters.forEach((notes, tagId) => {
			const clusterSize = notes.length
			// Tags with moderate-sized clusters are most valuable (not too small, not too large)
			const connectivityValue = Math.min(clusterSize, 10) // Cap value to avoid huge clusters dominating
			const importanceScore =
				connectivityValue * Math.log(clusterSize + 1)
			tagImportance.set(tagId, importanceScore)
		})

		// Step 2: Select optimal number of tags based on our formula
		const targetTagCount = Math.min(10, Math.ceil(MAX_NODES / 4))

		const selectedTags = Array.from(tagClusters.entries())
			.sort(
				(a, b) =>
					(tagImportance.get(b[0]) || 0) -
					(tagImportance.get(a[0]) || 0)
			)
			.slice(0, targetTagCount)
			.map(([tagId]) => tagId)

		// Step 3: Select most important notes per tag
		const selectedNotes = new Set<string>()
		const processedRelationships: NodeRelationship[] = []

		// Distribute note quota among selected tags
		const notesPerTag =
			Math.floor(MAX_NODES - selectedTags.length) / selectedTags.length

		selectedTags.forEach((tagId) => {
			const notesForTag = tagClusters.get(tagId) || []

			// Get most connected notes (those with most tags/connections)
			const noteConnectionCounts = new Map<string, number>()

			notesForTag.forEach((noteId) => {
				relationships.forEach((rel) => {
					if (rel.source === noteId) {
						noteConnectionCounts.set(
							noteId,
							(noteConnectionCounts.get(noteId) || 0) + 1
						)
					}
				})
			})

			// Select top notes for this tag
			const topNotesForTag = Array.from(notesForTag)
				.sort(
					(a, b) =>
						(noteConnectionCounts.get(b) || 0) -
						(noteConnectionCounts.get(a) || 0)
				)
				.slice(0, Math.max(2, Math.ceil(notesPerTag)))

			// Add to selected notes
			topNotesForTag.forEach((noteId) => selectedNotes.add(noteId))
		})

		// Step 4: Build final graph with strict limits
		const finalNodes = new Map<string, GraphNode>()
		const finalRelationships: NodeRelationship[] = []

		// Add selected tag nodes
		selectedTags.forEach((tagId) => {
			const tagNode = nodes.get(tagId)
			if (tagNode) finalNodes.set(tagId, tagNode)
		})

		// Add selected note nodes
		selectedNotes.forEach((noteId) => {
			const noteNode = nodes.get(noteId)
			if (noteNode) finalNodes.set(noteId, noteNode)
		})

		// Add relationships, but only between selected nodes
		relationships.forEach((rel) => {
			if (finalNodes.has(rel.source) && finalNodes.has(rel.target)) {
				finalRelationships.push(rel)

				// If we exceed relationship limit, stop adding
				if (finalRelationships.length >= MAX_RELATIONSHIPS) {
					return
				}
			}
		})

		// Final verification
		const totalElements = finalNodes.size + finalRelationships.length
		console.log(
			`Final reduced graph: ${finalNodes.size} nodes, ${finalRelationships.length} relationships (${totalElements} total elements)`
		)

		// Apply our changes
		nodes.clear()
		finalNodes.forEach((node, key) => nodes.set(key, node))

		relationships.length = 0
		relationships.push(...finalRelationships)
	}

	private prune(
		nodes: Map<string, GraphNode>,
		relationships: NodeRelationship[]
	): void {
		const connectedNodes = new Set<string>()

		relationships.forEach((rel) => {
			connectedNodes.add(rel.source)
			connectedNodes.add(rel.target)
		})

		const filteredNodes = new Map<string, GraphNode>()
		nodes.forEach((node, key) => {
			if (connectedNodes.has(key)) {
				filteredNodes.set(key, node)
			}
		})

		nodes.clear()
		filteredNodes.forEach((node, key) => nodes.set(key, node))
	}

	// Applies DOT-specific features
	private runDotSettings(graph: Graph): void {
		// Respect relationship weight setting
		if (this.settings.includeWeights && this.settings.weightThreshold) {
			graph.relationships = graph.relationships.filter(
				(rel) => rel.weight >= this.settings.weightThreshold!
			)
		}

		// Respect subgraph clusters setting
		if (this.settings.subgraphs) {
			this.clusterSubgraphs(graph)
		}
	}

	// Groups nodes into visual subgraph clusters by node type for DOT editors to read metadata
	private clusterSubgraphs(graph: Graph): void {
		graph.nodes.forEach((node) => {
			node.subgraph = node.type // This metadata will be used in DOT export
		})
	}

	// Applies Mermaid-specific features
	private runMMDSettings(graph: Graph): void {
		// Respect max-relationships-per-note setting
		if (this.settings.maxEPerV) {
			const outgoingArrows = new Map<string, number>()

			// Count outgoing edges per node
			graph.relationships.forEach((rel) => {
				outgoingArrows.set(
					rel.source,
					(outgoingArrows.get(rel.source) || 0) + 1
				)
			})

			// Filter relationships for notes with too many connections
			const filteredArrows: NodeRelationship[] = []
			const processedArrows = new Map<string, number>()

			// Sort by weight first to keep the most important relationships
			const sortedRelationships = [...graph.relationships].sort(
				(a, b) => b.weight - a.weight
			)

			for (const rel of sortedRelationships) {
				const sourceKey = rel.source
				const currentCount = processedArrows.get(sourceKey) || 0

				if (
					currentCount < this.settings.maxEPerV ||
					(outgoingArrows.get(sourceKey) || 0) <=
						this.settings.maxEPerV
				) {
					filteredArrows.push(rel)
					processedArrows.set(sourceKey, currentCount + 1)
				}
			}

			graph.relationships = filteredArrows
		}
	}

	// Injects the final mermaid content
	runMMDPrinter(graph: Graph): string {
		console.log(
			`Nodes count: ${graph.nodes.length}, Relationships count: ${graph.relationships.length}`
		)
		let mermaid = `graph ${this.settings.direction || 'TD'}\n`

		graph.nodes.forEach((node) => {
			const nodeId = cleanId(node.id)
			mermaid += `    ${nodeId}["${safeEscape(node.name)}"]\n`
		})

		// Injects relationships
		graph.relationships.forEach((r) => {
			const sourceId = cleanId(r.source)
			const targetId = cleanId(r.target)
			mermaid += `    ${sourceId} --> ${targetId}\n`
		})

		return mermaid
	}

	// Injects the final dot content
	runDotPrinter(graph: Graph): string {
		const vaultName = this.app.vault.getName()
		let dot = `digraph ${vaultName} {\n`
		dot += '    rankdir=LR;\n'
		dot += '    node [shape=box, style=rounded];\n'

		// Respect subgraph setting
		if (this.settings.subgraphs) {
			const nodesByCluster = new Map<string, GraphNode[]>()

			// Group nodes by their assigned cluster
			graph.nodes.forEach((node) => {
				const cluster = node.subgraph || node.type
				if (!nodesByCluster.has(cluster)) {
					nodesByCluster.set(cluster, [])
				}
				nodesByCluster.get(cluster)!.push(node)
			})

			// Inject each cluster as a DOT subgraph
			nodesByCluster.forEach((nodes, cluster) => {
				dot += `    subgraph cluster_${cleanId(cluster)} {\n`
				dot += `        label="${cluster}";\n`
				dot += '        style=rounded;\n'
				dot += '        color="#cccccc";\n'

				nodes.forEach((node) => {
					const nodeId = cleanId(node.id)
					const nodeStyle =
						node.type === 'attachment'
							? 'fillcolor="#ffcc80", style="filled,rounded"'
							: 'fillcolor="#e3f2fd", style="filled,rounded"'

					dot += `        "${nodeId}" [label="${safeEscape(node.name)}", ${nodeStyle}];\n`
				})

				dot += '    }\n'
			})
		} else {
			// Inject nodes without clustering
			graph.nodes.forEach((node) => {
				const nodeId = cleanId(node.id)
				const nodeStyle =
					node.type === 'attachment'
						? 'fillcolor="#ffcc80", style="filled,rounded"'
						: 'fillcolor="#e3f2fd", style="filled,rounded"'

				dot += `    "${nodeId}" [label="${safeEscape(node.name)}", ${nodeStyle}];\n`
			})
		}

		// Inject relationships with optional weights
		graph.relationships.forEach((r) => {
			const sourceId = cleanId(r.source)
			const targetId = cleanId(r.target)
			const weightAttr =
				this.settings.includeWeights && r.weight > 1
					? ` [weight=${r.weight}]`
					: ''
			dot += `    "${sourceId}" -> "${targetId}"${weightAttr};\n`
		})

		dot += '}'
		return dot
	}
}
