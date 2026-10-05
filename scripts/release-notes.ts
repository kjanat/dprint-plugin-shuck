#!/usr/bin/env -S deno run --frozen -RWE
import { createFromBuffer } from '@dprint/formatter';
import { arg, cli, CLIError, command } from '@kjanat/dreamcli';
import { fromFileUrl, join, relative } from '@std/path';
import { parse } from '@std/toml';

export const releaseNotes = command('release-notes')
	.description('Generate release notes from the built plugin, schema, and Cargo.lock.')
	.arg(
		'artifactDir',
		arg.path({ type: 'directory' }).env('ARTIFACT_DIR').default('artifact').describe(
			'Directory containing plugin.wasm and schema.json.',
		),
	)
	.example(({ name }) => `${name} artifact`, 'Generate artifact/release-notes.md.')
	.action(async ({ args, out }) => {
		const pluginFile = 'plugin.wasm';
		const schemaFile = 'schema.json';
		const notesPath = join(args.artifactDir, 'release-notes.md');
		const updateSuffix = '/latest.json';
		const [wasm, schemaText, lockText] = await Promise.all([
			Deno.readFile(join(args.artifactDir, pluginFile)),
			Deno.readTextFile(join(args.artifactDir, schemaFile)),
			Deno.readTextFile(new URL('../Cargo.lock', import.meta.url)),
		]);
		const formatter = createFromBuffer(wasm);
		const info = formatter.getPluginInfo();
		const schema: { $id: string } = JSON.parse(schemaText);
		if (schema.$id !== info.configSchemaUrl) {
			throw new CLIError('The schema must match the built plugin.', { code: 'SCHEMA_MISMATCH' });
		}

		const lock = parse(lockText);
		const packages = lock.package as { name: string; version: string }[];
		const upstream = packages.filter((pkg) => pkg.name === 'shuck-formatter');
		if (upstream.length !== 1) {
			throw new CLIError('Expected one resolved Shuck formatter version.', { code: 'INVALID_LOCKFILE' });
		}
		const upstreamVersion = upstream[0].version;

		if (!info.updateUrl?.endsWith(updateSuffix)) {
			throw new CLIError('Expected a dprint plugin update URL.', { code: 'INVALID_PLUGIN_METADATA' });
		}
		const proxyBase = info.updateUrl.slice(0, -updateSuffix.length);
		const slug = new URL(proxyBase).pathname.slice(1);
		const pluginUrl = `${proxyBase}-${info.version}.wasm`;
		const config = JSON.stringify({ plugins: [pluginUrl] }, null, 2);

		formatter.setConfig({}, {});
		if (formatter.getConfigDiagnostics().length) {
			throw new CLIError('The plugin default configuration must be valid.', { code: 'INVALID_PLUGIN_CONFIG' });
		}
		const extensions = formatter.getFileMatchingInfo().fileExtensions.map((extension) => `\`.${extension}\``).join(
			', ',
		);
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
		if (out.jsonMode) out.json({ output: notesPath, name: info.name, version: info.version });
		else out.log(`Generated ${notesPath} for ${info.name} ${info.version}.`);
	});

export const app = cli(relative(Deno.cwd(), fromFileUrl(import.meta.url))).default(releaseNotes);

if (import.meta.main) await app.run();
