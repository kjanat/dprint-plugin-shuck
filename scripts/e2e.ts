import { createFromBuffer } from '@dprint/formatter';
import { assert, assertEquals, assertThrows } from '@std/assert';

const root = new URL('../', import.meta.url);
const wasmUrl = new URL(Deno.args[0] ?? 'target/wasm32-unknown-unknown/wasm-release/dprint_plugin_shuck.wasm', root);
const wasm = await Deno.readFile(wasmUrl);
const source = await Deno.readTextFile(new URL('tests/fixtures/input.bash', root));
const expected = await Deno.readTextFile(new URL('tests/fixtures/expected.bash', root));

Deno.test('Wasm formatter: fixture, idempotence, globals, and overrides', () => {
	const formatter = createFromBuffer(wasm);
	formatter.setConfig({ useTabs: false, indentWidth: 2 }, {});
	assertEquals(formatter.getConfigDiagnostics(), []);
	assertEquals(formatter.formatText({ filePath: 'script.bash', fileText: source }), expected);
	assertEquals(formatter.formatText({ filePath: 'script.bash', fileText: expected }), expected);
	assertEquals(
		formatter.formatText({ filePath: 'script.bash', fileText: source, overrideConfig: { indentWidth: 4 } }),
		expected.replace('  echo', '    echo'),
	);
});

Deno.test('Wasm formatter: identity, diagnostics, and parse errors', () => {
	const formatter = createFromBuffer(wasm);
	const info = formatter.getPluginInfo();
	assertEquals(info.configKey, 'shuck');
	assertEquals(info.updateUrl, 'https://plugins.dprint.dev/kjanat/shuck/latest.json');
	assertEquals(info.configSchemaUrl, `https://plugins.dprint.dev/kjanat/shuck/${info.version}/schema.json`);
	formatter.setConfig({}, { unknown: true });
	assertEquals(formatter.getConfigDiagnostics().map((item) => item.propertyName), ['unknown']);
	formatter.setConfig({}, {});
	assertThrows(() => formatter.formatText({ filePath: 'script.sh', fileText: 'if then\n' }), Error, 'parse error');
});

async function run(cwd: string, ...args: string[]): Promise<void> {
	const result = await new Deno.Command('dprint', { args, cwd, stdout: 'piped', stderr: 'piped' }).output();
	if (!result.success) {
		const decoder = new TextDecoder();
		throw new Error(`dprint ${args.join(' ')}: ${decoder.decode(result.stdout)}${decoder.decode(result.stderr)}`);
	}
}

Deno.test('CLI: associations, overrides, and local update dry run', async () => {
	const project = await Deno.makeTempDir({ prefix: 'shuck-e2e-' });
	try {
		const configPath = `${project}/dprint.json`;
		const config = JSON.stringify({
			plugins: [wasmUrl.href],
			excludes: [],
			incremental: false,
			shuck: {
				useTabs: false,
				indentWidth: 2,
				associations: ['**/*.shell', '!**/excluded.bash'],
				overrides: [{ files: ['override.bash'], indentWidth: 4 }],
			},
		});
		await Deno.writeTextFile(configPath, config);
		for (const name of ['script.bash', 'custom.shell', 'override.bash', 'excluded.bash']) {
			await Deno.writeTextFile(`${project}/${name}`, source);
		}
		await run(project, 'fmt');
		assertEquals(await Deno.readTextFile(`${project}/script.bash`), expected);
		assertEquals(await Deno.readTextFile(`${project}/custom.shell`), expected);
		assertEquals(await Deno.readTextFile(`${project}/override.bash`), expected.replace('  echo', '    echo'));
		assertEquals(await Deno.readTextFile(`${project}/excluded.bash`), source);
		await run(project, 'check');
		await run(project, 'config', 'update', '--dry-run');
		assertEquals(await Deno.readTextFile(configPath), config);
	} finally {
		await Deno.remove(project, { recursive: true });
	}
});

Deno.test('CLI: HTTP checksum installation and formatting', async () => {
	const project = await Deno.makeTempDir({ prefix: 'shuck-install-' });
	const server = Deno.serve(
		{ hostname: '127.0.0.1', port: 0, onListen() {} },
		() => new Response(wasm, { headers: { 'content-type': 'application/wasm' } }),
	);
	try {
		const configPath = `${project}/dprint.json`;
		await Deno.writeTextFile(configPath, JSON.stringify({ plugins: [], excludes: [], incremental: false }));
		await Deno.writeTextFile(`${project}/script.bash`, source);
		const url = `http://127.0.0.1:${server.addr.port}/plugin.wasm`;
		await run(project, 'add', '--checksum', url);
		const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', wasm));
		const checksum = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
		const installed: { plugins: string[] } = JSON.parse(await Deno.readTextFile(configPath));
		assertEquals(installed.plugins, [`${url}@${checksum}`]);
		await run(project, 'fmt');
		assert((await Deno.readTextFile(`${project}/script.bash`)).includes('echo hi'));
		await run(project, 'check');
	} finally {
		await server.shutdown();
		await Deno.remove(project, { recursive: true });
	}
});
