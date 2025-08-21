import type {
	EGVSettings,
	Graph,
	GraphNode,
	NodeRelationship,
} from 'src/schema'
import {
	type App,
	type Vault,
	type MetadataCache,
	normalizePath,
	TFile,
	TFolder,
	Notice,
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
	getN(): number
	getT(): number
	getK(): number
	getOptimalN(E_max?: number): number
	isTearing(E_max?: number): boolean
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
			isTearing(E_max: number = 150): boolean {
				// Never perform auto-reduction for single graphs
				if (this.settings.viewMode === 'singleGraph') {
					return false
				}
				// Respect the user override
				if (this.settings.enableAutoBridge === false) {
					return false
				}

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
			case 'singleTag':
				this.singleTagNetwork(vaultEnv)
				break
			case 'singleNote':
				this.singleNoteNetwork(vaultEnv)
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

			if (tempEnv.isTearing()) {
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

	// Strategy: Filter for single tag as root
	private singleTagNetwork(vaultEnv: VaultEnv): void {
		const rootTag = this.settings.rootTag || ''
		const vAndW = new Map<string, GraphNode>()
		const e: NodeRelationship[] = []

		// First, add the root tag if it exists
		if (rootTag && vaultEnv.nodes.has(rootTag)) {
			vAndW.set(rootTag, vaultEnv.nodes.get(rootTag)!)
		} else {
			new Notice(`Tag "${rootTag}" not found in your vault`)
			return
		}

		// Find all notes related to this tag
		vaultEnv.relationships.forEach((rel) => {
			const targetNode = vaultEnv.nodes.get(rel.target)
			const sourceNode = vaultEnv.nodes.get(rel.source)

			// Include relationships where either source or target is the root tag
			if (
				(rel.target === rootTag && sourceNode?.type === 'note') ||
				(rel.source === rootTag && targetNode?.type === 'note')
			) {
				// Add the note to the nodes map
				if (rel.target === rootTag && sourceNode) {
					vAndW.set(rel.source, sourceNode)
				} else if (rel.source === rootTag && targetNode) {
					vAndW.set(rel.target, targetNode)
				}

				e.push(rel)
			}
		})

		vaultEnv.nodes = vAndW
		vaultEnv.relationships = e
	}

	// Strategy: Filter for single note as root
	private singleNoteNetwork(vaultEnv: VaultEnv): void {
		const rootNote = this.settings.rootNote || ''
		const vAndW = new Map<string, GraphNode>()
		const e: NodeRelationship[] = []

		// Find the note by title
		const rootNotePath = Array.from(vaultEnv.nodes.entries()).find(
			([key, node]) => node.type === 'note' && node.name === rootNote
		)?.[0]

		if (!rootNotePath) {
			new Notice(`Note "${rootNote}" not found in your vault`)
			return
		}

		// Add the root note
		vAndW.set(rootNotePath, vaultEnv.nodes.get(rootNotePath)!)

		// Find all relationships to root v note
		vaultEnv.relationships.forEach((rel) => {
			if (rel.source === rootNotePath) {
				// Outgoing relationship
				const targetNode = vaultEnv.nodes.get(rel.target)
				if (targetNode) {
					vAndW.set(rel.target, targetNode)
					e.push(rel)
				}
			} else if (rel.target === rootNotePath) {
				// Incoming relationship
				const sourceNode = vaultEnv.nodes.get(rel.source)
				if (sourceNode) {
					vAndW.set(rel.source, sourceNode)
					e.push(rel)
				}
			}
		})

		vaultEnv.nodes = vAndW
		vaultEnv.relationships = e
	}

	// Mermaid-specific task when the initial mermaid graph object is tearing
	// Creates a reduced graph G'(V',E') where |V'| + |E'| ≤ MAX_TOTAL_ELEMENTS - BRIDGING PATTERN
	private backoffSingularity(
		nodes: Map<string, GraphNode>,
		relationships: NodeRelationship[],
		vaultEnv: VaultEnv
	): void {
		const MAX_NODES = vaultEnv.settings.maxNodes || 40
		const MAX_RELATIONSHIPS = vaultEnv.settings.maxRelationships || 60
		const MAX_TAGS = vaultEnv.settings.maxTags || 10

		console.log('Starting backoff task')

		// Build the count of {E(v,w)}
		const optimalVAndW = new Map<string, string[]>()

		relationships.forEach((rel) => {
			const target = vaultEnv.nodes.get(rel.target)
			if (target?.type === 'tag') {
				if (!optimalVAndW.has(rel.target)) {
					optimalVAndW.set(rel.target, [])
				}
				optimalVAndW.get(rel.target)!.push(rel.source)
			}
		})

		// Select top tags by the amount of notes pointing to them - most important tags at the front of the pack
		const survivingTags = Array.from(optimalVAndW.entries())
			.sort((a, b) => b[1].length - a[1].length)
			.slice(0, MAX_TAGS)
			.map(([tagId]) => tagId)

		// Score the E where E = (v_important, w) w being the notes - if we're looking for a bridging pattern in the overall mermaid chart
		const noteScores = new Map<string, number>()
		survivingTags.forEach((tagId) => {
			optimalVAndW.get(tagId)?.forEach((noteId) => {
				noteScores.set(noteId, (noteScores.get(noteId) || 0) + 1)
			})
		})

		// Select top notes based on E(v_important, w_most)
		const survivingNotes = new Set(
			Array.from(noteScores.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, MAX_NODES - survivingTags.length)
				.map(([noteId]) => noteId)
		)

		// Rebuild graph
		nodes.clear()
		relationships.length = 0

		survivingTags.forEach((tagId) => {
			const v = vaultEnv.nodes.get(tagId)
			if (v) nodes.set(tagId, v)
		})

		survivingNotes.forEach((noteId) => {
			const w = vaultEnv.nodes.get(noteId)
			if (w) nodes.set(noteId, w)
		})

		// Rebuild relationships for graph
		let E = new Set<string>()

		// First pass: tag-note connections
		vaultEnv.relationships.forEach((rel) => {
			if (
				nodes.has(rel.source) &&
				nodes.has(rel.target) &&
				E.size < MAX_RELATIONSHIPS
			) {
				const sourceIsNote =
					vaultEnv.nodes.get(rel.source)?.type !== 'tag'
				const targetIsTag =
					vaultEnv.nodes.get(rel.target)?.type === 'tag'

				if (sourceIsNote && targetIsTag) {
					relationships.push(rel)
					E.add(`${rel.source}-${rel.target}`)
				}
			}
		})

		// Second pass: remaining connections
		vaultEnv.relationships.forEach((rel) => {
			const relId = `${rel.source}-${rel.target}`
			if (
				nodes.has(rel.source) &&
				nodes.has(rel.target) &&
				!E.has(relId) &&
				E.size < MAX_RELATIONSHIPS
			) {
				relationships.push(rel)
				E.add(relId)
			}
		})

		console.log(
			`Final reduced graph: ${nodes.size} nodes, ${relationships.length} relationships (${nodes.size + relationships.length} total elements)`
		)
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

	// Some f(Weight(v,w), Format = .dot)
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

	// Some f(Weight(v,w), Format = .mmd)
	private runMMDSettings(graph: Graph): void {
		// Respect max-relationships-per-note setting
		if (this.settings.maxEPerV) {
			const survivors: NodeRelationship[] = []
			const cutoff = new Map<string, number>()

			// Most weighted notes at the front of the pack to survive any pruning
			const survivingECandidates = [...graph.relationships].sort(
				(a, b) => b.weight - a.weight
			)

			// Add important edges until we reach the mavEPerV cutoff point
			for (const e of survivingECandidates) {
				const eCount = cutoff.get(e.source) || 0

				if (eCount < this.settings.maxEPerV) {
					survivors.push(e)
					cutoff.set(e.source, eCount + 1)
				}
			}

			graph.relationships = survivors
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
		let dot = `digraph "${vaultName}" {\n`
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
