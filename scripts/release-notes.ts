#!/usr/bin/env -S deno run --frozen -RW
import { createFromBuffer } from '@dprint/formatter';
import { assert, assertEquals } from '@std/assert';
import { parse } from '@std/toml';

const artifactDir = Deno.args[0] ?? 'artifact';
const pluginFile = 'plugin.wasm';
const schemaFile = 'schema.json';
const notesPath = `${artifactDir}/release-notes.md`;
const updateSuffix = '/latest.json';
const wasm = await Deno.readFile(`${artifactDir}/${pluginFile}`);
const formatter = createFromBuffer(wasm);
const info = formatter.getPluginInfo();
const schema: { $id: string } = JSON.parse(await Deno.readTextFile(`${artifactDir}/${schemaFile}`));
assertEquals(schema.$id, info.configSchemaUrl, 'The schema must match the built plugin.');

const lock = parse(await Deno.readTextFile(new URL('../Cargo.lock', import.meta.url)));
const packages = lock.package as { name: string; version: string }[];
const upstream = packages.filter((pkg) => pkg.name === 'shuck-formatter');
assertEquals(upstream.length, 1, 'Expected one resolved Shuck formatter version.');
const upstreamVersion = upstream[0].version;

assert(info.updateUrl && info.updateUrl.endsWith(updateSuffix), 'Expected a dprint plugin update URL.');
const proxyBase = info.updateUrl.slice(0, -updateSuffix.length);
const slug = new URL(proxyBase).pathname.slice(1);
const pluginUrl = `${proxyBase}-${info.version}.wasm`;
const config = JSON.stringify({ plugins: [pluginUrl] }, null, 2);

formatter.setConfig({}, {});
assertEquals(formatter.getConfigDiagnostics(), []);
const extensions = formatter.getFileMatchingInfo().fileExtensions.map((extension) => `\`.${extension}\``).join(', ');
const size = (wasm.byteLength / 1024).toFixed(1);
const notes =
	`Shell formatting for dprint, powered by [Shuck ${upstreamVersion}](https://github.com/ewhauser/shuck/releases/tag/v${upstreamVersion}).

## Install

~~~sh
dprint add ${slug}
~~~

Already using the plugin? Run \`dprint config update\`.

## Pin this version

Add this entry to your dprint configuration to use version ${info.version}:

~~~json
${config}
~~~

## Included

- **Formatter:** Shuck ${upstreamVersion}; default file extensions: ${extensions}.
- **Wasm plugin:** \`${pluginFile}\` — ${size} KiB (${wasm.byteLength.toLocaleString('en-US')} bytes).
- **Configuration:** [JSON Schema](${info.configSchemaUrl}) · [Options and usage](${info.helpUrl}/blob/${info.version}/README.md#configuration).

The schema is also attached as \`${schemaFile}\`. Formatting runs inside dprint's Wasm sandbox.
`;

await Deno.writeTextFile(notesPath, notes);
console.log(`Generated ${notesPath} for ${info.name} ${info.version}.`);
