// Pre-processing
export interface EGVSettings {
	// New devision path
	viewMode?: 'singleGraph' | 'fullGraph' | 'notSet'

	// Stable props
	exportFormat: 'mmd' | 'dot'
	includeOrphans: boolean
	includeAttachments: boolean
	lastExported: string
	includeWeights: boolean
	relationshipStrategy:
		| 'tags'
		| 'internalLinks'
		| 'folders'
		| 'singleTag'
		| 'singleNote'
	// Optional format-specific properties
	// DOT
	weightThreshold?: number
	subgraphs?: boolean
	// MMD
	direction?: 'TD' | 'LR' | 'RL' | 'BT'
	maxEPerV?: number
	// MMD backoff
	enableAutoBridge: boolean
	manualBackoff: boolean
	maxNodes?: number
	maxRelationships?: number
	maxTags?: number
	// New single-strategy props for user input
	rootTag?: string
	rootNote?: string
}

export const DEFAULT_SET: EGVSettings = {
	exportFormat: 'mmd',
	includeOrphans: false,
	includeAttachments: false,
	lastExported: '',
	includeWeights: false,
	relationshipStrategy: 'tags',
	weightThreshold: 1,
	subgraphs: false,
	direction: 'TD',
	maxEPerV: 10,
	enableAutoBridge: true,
	manualBackoff: false,
	maxNodes: 40,
	maxRelationships: 60,
	maxTags: 10,
}

// Processing structs
export interface Graph {
	nodes: GraphNode[]
	relationships: NodeRelationship[]
}

export interface GraphNode {
	id: string
	name: string
	type: 'note' | 'attachment' | 'tag' | 'folder'
	subgraph?: string
}

export interface NodeRelationship {
	source: string
	target: string
	weight: number
}
