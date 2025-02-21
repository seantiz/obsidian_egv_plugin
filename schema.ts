export interface EGVSettings {
	exportFormat: "mmd" | "dot";
	includeOrphans: boolean;
	includeAttachments: boolean;
	maxNodes: number;
	lastExported: string;
}

export const DEFAULT_SETTINGS: EGVSettings = {
	exportFormat: "mmd",
	includeOrphans: false,
	includeAttachments: false,
	maxNodes: 1000,
	lastExported: "",
};

export interface GraphData {
	nodes: any[];
	links: {
		source: string;
		target: string;
	}[];
}
