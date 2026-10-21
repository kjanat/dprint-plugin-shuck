#!/usr/bin/env -S deno run --frozen -RWE --allow-run=git
import { createFromBuffer } from '@dprint/formatter';
import { arg, cli, CLIError, command } from '@kjanat/dreamcli';
import { fromFileUrl, join, relative } from '@std/path';
import { parse } from '@std/toml';

const shuckRepo = 'https://github.com/ewhauser/shuck';

function resolvedVersion(pkg: unknown, name: string): string | undefined {
	if (typeof pkg !== 'object' || pkg === null || !('name' in pkg) || !('version' in pkg)) return undefined;
	return pkg.name === name && typeof pkg.version === 'string' ? pkg.version : undefined;
}

export function shuckVersion(lockText: string): string {
	const { package: packages } = parse(lockText);
	const versions = Array.isArray(packages)
		? packages.flatMap((pkg) => resolvedVersion(pkg, 'shuck-formatter') ?? [])
		: [];
	if (versions.length !== 1) {
		throw new CLIError('Expected one resolved Shuck formatter version.', { code: 'INVALID_LOCKFILE' });
	}
	return versions[0];
}

export function releaseTitle(version: string, shuck: string): string {
	return `${version} - Shuck ${shuck}`;
}

export function upstreamSection(previous: string | undefined, current: string): string {
	if (previous === undefined || previous === current) return '';
	return `

## Shuck ${previous} to ${current}

Formatting changes in this release come from Shuck. See the [upstream changes](${shuckRepo}/compare/v${previous}...v${current}) and the [Shuck ${current} release](${shuckRepo}/releases/tag/v${current}).`;
}

async function git(...args: string[]): Promise<string | undefined> {
	const { success, stdout } = await new Deno.Command('git', { args, stdout: 'piped', stderr: 'null' }).output();
	return success ? new TextDecoder().decode(stdout).trim() : undefined;
}

export async function previousLockfile(version: string): Promise<string | undefined> {
	const tag = await git('describe', '--tags', '--abbrev=0', '--exclude', version);
	if (tag === undefined) return undefined;
	const lock = await git('show', `${tag}:Cargo.lock`);
	if (lock === undefined) {
		throw new CLIError(`Tag ${tag} has no Cargo.lock.`, { code: 'INVALID_PREVIOUS_RELEASE' });
	}
	return lock;
}

export const releaseNotes = command('release-notes')
	.description(
		'Generate release notes and title from the built plugin, schema, Cargo.lock, and the previous release tag.',
	)
	.arg(
		'artifactDir',
		arg.path({ type: 'directory' }).env('ARTIFACT_DIR').default('artifact').describe(
			'Directory containing plugin.wasm and schema.json.',
		),
	)
	.example(({ name }) => `${name} artifact`, 'Generate artifact/release-notes.md and artifact/release-title.txt.')
	.action(async ({ args, out }) => {
		const pluginFile = 'plugin.wasm';
		const schemaFile = 'schema.json';
		const notesPath = join(args.artifactDir, 'release-notes.md');
		const titlePath = join(args.artifactDir, 'release-title.txt');
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

		const upstreamVersion = shuckVersion(lockText);
		const previousLock = await previousLockfile(info.version);
		const previousVersion = previousLock === undefined ? undefined : shuckVersion(previousLock);

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
			`Shell formatting for dprint, powered by [Shuck ${upstreamVersion}](${shuckRepo}/releases/tag/v${upstreamVersion}).${
				upstreamSection(previousVersion, upstreamVersion)
			}

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

		const title = releaseTitle(info.version, upstreamVersion);
		await Promise.all([Deno.writeTextFile(notesPath, notes), Deno.writeTextFile(titlePath, title + '\n')]);
		if (out.jsonMode) {
			out.json({ output: notesPath, title, name: info.name, version: info.version, shuck: upstreamVersion });
		} else out.log(`Generated ${notesPath} for ${info.name} ${info.version}.`);
	});

export const app = cli(relative(Deno.cwd(), fromFileUrl(import.meta.url))).default(releaseNotes);

if (import.meta.main) await app.run();
