import { createFromBuffer } from '@dprint/formatter';
import { assert, assertEquals } from '@std/assert';
import { parse } from '@std/toml';

const artifactDir = Deno.args[0] ?? 'artifact';
const wasm = await Deno.readFile(`${artifactDir}/plugin.wasm`);
const formatter = createFromBuffer(wasm);
const info = formatter.getPluginInfo();
const schema: { $id: string } = JSON.parse(await Deno.readTextFile(`${artifactDir}/schema.json`));
assertEquals(schema.$id, info.configSchemaUrl, 'The schema must match the built plugin.');

const lock = parse(await Deno.readTextFile(new URL('../Cargo.lock', import.meta.url)));
const packages = lock.package as { name: string; version: string }[];
const upstream = packages.filter((pkg) => pkg.name === 'shuck-formatter');
assertEquals(upstream.length, 1, 'Expected one resolved Shuck formatter version.');
const upstreamVersion = upstream[0].version;

assert(info.updateUrl && info.updateUrl.endsWith('/latest.json'), 'Expected a dprint plugin update URL.');
const proxyBase = info.updateUrl.slice(0, -'/latest.json'.length);
const slug = new URL(proxyBase).pathname.slice(1);
const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', wasm));
const checksum = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
const pluginUrl = `${proxyBase}-${info.version}.wasm@${checksum}`;
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

Add this checksum-pinned entry to your dprint configuration:

~~~json
${config}
~~~

## Included

- **Formatter:** Shuck ${upstreamVersion}; default file extensions: ${extensions}.
- **Wasm plugin:** \`plugin.wasm\` — ${size} KiB (${wasm.byteLength.toLocaleString('en-US')} bytes).
- **Configuration:** [JSON Schema](${info.configSchemaUrl}) · [Options and usage](${info.helpUrl}/blob/${info.version}/README.md#configuration).

The schema is also attached as \`schema.json\`. Formatting runs inside dprint's Wasm sandbox.
`;

await Deno.writeTextFile(`${artifactDir}/release-notes.md`, notes);
console.log(`Generated ${artifactDir}/release-notes.md for ${info.name} ${info.version}.`);
