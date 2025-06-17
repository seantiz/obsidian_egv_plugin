// Pre-processing
export interface EGVSettings {
	exportFormat: 'mmd' | 'dot'
	includeOrphans: boolean
	includeAttachments: boolean
	lastExported: string
	includeWeights: boolean
	relationshipStrategy: 'tags' | 'internalLinks' | 'folders'
	// Optional format-specific properties
	// DOT
	weightThreshold?: number
	subgraphs?: boolean
	// MMD
	direction?: 'TD' | 'LR' | 'RL' | 'BT'
	maxEPerV?: number
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
