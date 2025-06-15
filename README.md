# Export Graph View Plugin

This is an Obsidian community plugin for exporting your vault's notes and attachments metadata as graph files.

You can export in either `.mmd` (Mermaid) format or `.dot` (for GraphViz) format for all your data viz habits.

There are a couple of other community plugins that can do similar, but they enforce a pipeline where you have to use your exported data within a specific environment or program.

I personally wanted a more straightforward tool - welcome to EGV.

## A Couple More Details

1. All graph files are exported to your vault's root folder.
2. You can go to EGV either from the settings menu or the left-hand side menu in your vault.

## Memory Safety

You can use the Maximum Nodes Setting slider to hard limit the maximum nodes that can be included in the final file. Don't worry about this too much at first glance; the EGV plugin will let you know how many notes and attachments you're set to export.

Max nodes is an arbitrary setting of anywhere up to 5000 nodes, but it is a safeguard for when you're:

1. On a device with less memory
2. Are dealing with a mature vault that holds a lot of notes
3. Combination of the two factors above

## Support

This plugin is really still in beta when it comes to testing. Please get in touch if you run into any bugs.
