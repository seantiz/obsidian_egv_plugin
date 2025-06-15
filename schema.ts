export interface EGVSettings {
	exportFormat: "mmd" | "dot";
	includeOrphans: boolean;
	includeAttachments: boolean;
	maxNodes: number;
	lastExported: string;
	includeWeights: boolean;
}

export const DEFAULT_SETTINGS: EGVSettings = {
	exportFormat: "mmd",
	includeOrphans: false,
	includeAttachments: false,
	maxNodes: 1000,
	lastExported: "",
	includeWeights: false,
};

export interface Graph {
	nodes: any[];
	links: LinkMetadata[]
}

export interface LinkMetadata {
	source: string,
	target: string,
	weight: number
}
