import { App, Plugin, Notice, MetadataCache, normalizePath } from "obsidian";
import { type EGVSettings, type GraphData, DEFAULT_SETTINGS } from "schema";
import { EGVSettingTab } from "settings";
import { EGVModal } from "views";

export default class EGVPlugin extends Plugin {
	settings: EGVSettings;
	app: App;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon("dot-network", "Export Graph View", () => {
			new EGVModal(this.app, this).open();
		});

		this.addCommand({
			id: "export-graph",
			name: "Export Graph to File",
			callback: () => {
				new EGVModal(this.app, this).open();
			},
		});

		this.addSettingTab(new EGVSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async exportGraph(providedFilename: string = "") {
		try {
			const graphdata = this.generateGraphData();

			let exportFilename: string;
			if (providedFilename) {
				exportFilename = normalizePath(providedFilename);
			} else {
				const vaultName = this.app.vault.getName();
				exportFilename = normalizePath(`${vaultName}-graph-data`);
			}

			this.settings.lastExported = exportFilename;
			await this.saveSettings();

			let filenameWithExtension: string;
			if (this.settings.exportFormat === "mmd") {
				filenameWithExtension = await this.exportMermaid(graphdata, exportFilename);
			} else {
				filenameWithExtension = await this.exportDot(graphdata, exportFilename);
			}

			new Notice(`Graph data exported to ${normalizePath(this.getExportPath(filenameWithExtension))}`, 5000);

			return filenameWithExtension;
		} catch (error) {
			new Notice(`There was a problem exporting graph data: ${error.message}`);
			return null;
		}
	}

	generateGraphData() {
		const metadataCache: MetadataCache = this.app.metadataCache;
		const vault = this.app.vault;
		const nodes = new Map();
		const links = [];

		const mdFiles = vault.getMarkdownFiles();
		const mdFilesWithRelationships = new Map<string, boolean>();

		for (const source in metadataCache.resolvedLinks) {
			const destinations = metadataCache.resolvedLinks[source];
			if (Object.keys(destinations).length > 0) {
				mdFilesWithRelationships.set(source, true);

				for (const target in destinations) {
					mdFilesWithRelationships.set(target, true);
				}
			}
		}

		for (const file of mdFiles) {
			if (nodes.size >= this.settings.maxNodes) break;

			if (!this.settings.includeOrphans && !mdFilesWithRelationships.get(file.path)) {
				continue;
			}

			nodes.set(file.path, {
				id: normalizePath(file.path),
				name: file.basename,
				type: "note",
			});
		}

		if (this.settings.includeAttachments && nodes.size < this.settings.maxNodes) {
			vault.getFiles().forEach((file) => {
				if (file.extension !== "md" && !nodes.has(file.path)) {
					if (nodes.size >= this.settings.maxNodes) return;

					nodes.set(file.path, {
						id: normalizePath(file.path),
						name: file.basename,
						type: "attachment",
					});
				}
			});
		}

		for (const source in metadataCache.resolvedLinks) {
			if (!nodes.has(source)) continue;

			const destinations = metadataCache.resolvedLinks[source];
			for (const target in destinations) {
				if (nodes.has(target)) {
					const linkCount = destinations[target];
					for (let i = 0; i < linkCount; i++) {
						links.push({
							source: source,
							target: target,
						});
					}
				}
			}
		}

		return {
			nodes: Array.from(nodes.values()),
			links: links,
		};
	}

	async exportMermaid(graphdata: GraphData, basepath: string) {
		const mermaidContent = this.convertToMermaid(graphdata);
		const filename = normalizePath(`${basepath}.mmd`);
		await this.app.vault.create(filename, mermaidContent);
		return filename;
	}

	async exportDot(graphdata: GraphData, basepath: string) {
		const dotContent = this.convertToDot(graphdata);
		const filename = normalizePath(`${basepath}.dot`);
		await this.app.vault.create(filename, dotContent);
		return filename;
	}

	getExportPath(providedFilename: string = ""): string {
		let exportFilename: string;
		if (providedFilename) {
			exportFilename = normalizePath(providedFilename);
		} else {
			const vaultName = this.app.vault.getName();
			exportFilename = normalizePath(`${vaultName}-graph-data`);
		}

		const exportFolder = this.app.vault.getName();
		return `${exportFolder}/${exportFilename}`;
	}

	convertToMermaid(graphdata: GraphData) {
		let mermaid = "graph TD\n";

		graphdata.nodes.forEach((node) => {
			const nodeId = this.sanitizeId(node.id);
			const nodeStyle = node.type === "attachment" ? "style=fill,stroke:#ff9900" : "";

			mermaid += `    ${nodeId}["${this.escapeLabel(node.name)}"]${nodeStyle ? " " + nodeStyle : ""}\n`;
		});

		// Add links
		graphdata.links.forEach((link) => {
			const sourceId = this.sanitizeId(link.source);
			const targetId = this.sanitizeId(link.target);
			mermaid += `    ${sourceId} --> ${targetId}\n`;
		});

		return mermaid;
	}

	convertToDot(graphdata: GraphData) {
		const vaultName = this.app.vault.getName();
		let dot = `digraph ${vaultName} {\n`;
		dot += "    rankdir=LR;\n";
		dot += "    node [shape=box, style=rounded];\n";

		graphdata.nodes.forEach((node) => {
			const nodeId = this.sanitizeId(node.id);
			const nodeStyle =
				node.type === "attachment"
					? 'fillcolor="#ffcc80", style="filled,rounded"'
					: 'fillcolor="#e3f2fd", style="filled,rounded"';

			dot += `    "${nodeId}" [label="${this.escapeLabel(node.name)}", ${nodeStyle}];\n`;
		});

		graphdata.links.forEach((link) => {
			const sourceId = this.sanitizeId(link.source);
			const targetId = this.sanitizeId(link.target);
			dot += `    "${sourceId}" -> "${targetId}";\n`;
		});

		dot += "}\n";
		return dot;
	}

	sanitizeId(id: string) {
		return id.replace(/[^a-zA-Z0-9]/g, "_");
	}

	escapeLabel(label: string) {
		return label.replace(/"/g, '\\"');
	}
}
