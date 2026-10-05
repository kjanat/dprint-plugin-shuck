import { createDenoAdapter } from '@kjanat/dreamcli/runtime';
import { runCommand } from '@kjanat/dreamcli/testkit';
import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { buildWasm } from './build-wasm.ts';

const { stat } = createDenoAdapter();

Deno.test('build-wasm: help and required output', async () => {
	const help = await runCommand(buildWasm, ['--help']);
	assertEquals(help.exitCode, 0);
	assertStringIncludes(help.stdout.join('\n'), 'output');
	assertStringIncludes(help.stdout.join('\n'), '--offline');
	assertEquals(help.stderr, []);

	const missing = await runCommand(buildWasm, []);
	assertEquals(missing.exitCode, 2);
	assertEquals(missing.stdout, []);
	assertStringIncludes(missing.stderr.join('\n'), 'output');
});

Deno.test('build-wasm: Cargo flags need the separator', async () => {
	const result = await runCommand(buildWasm, ['plugin.wasm', '--offline']);
	assertEquals(result.exitCode, 2);
	assertStringIncludes(result.stderr.join('\n'), '--offline');
});

Deno.test('build-wasm: rejects a directory as the output', async () => {
	const directory = await Deno.makeTempDir({ prefix: 'shuck-cli-' });
	try {
		const result = await runCommand(buildWasm, [directory], { stat });
		assertEquals(result.exitCode, 2);
		assertStringIncludes(result.stderr.join('\n'), 'file');
	} finally {
		await Deno.remove(directory);
	}
});

async function withProject(source: string, action: (project: string) => Promise<void>) {
	const project = await Deno.makeTempDir({ prefix: 'shuck-cli-' });
	try {
		await Deno.mkdir(`${project}/src`);
		await Deno.writeTextFile(
			`${project}/Cargo.toml`,
			`\
[package]
name = "dprint-plugin-shuck"
version = "0.0.0"
edition = "2024"

[lib]
crate-type = ["cdylib", "lib"]

[profile.wasm-release]
inherits = "release"
`,
		);
		await Deno.writeTextFile(`${project}/src/lib.rs`, source);
		const lockfile = await new Deno.Command('cargo', {
			args: ['generate-lockfile', '--manifest-path', `${project}/Cargo.toml`, '--offline'],
		}).output();
		assert(lockfile.success, new TextDecoder().decode(lockfile.stderr));
		await action(project);
	} finally {
		await Deno.remove(project, { recursive: true });
	}
}

Deno.test('build-wasm: forwards Cargo arguments and stages Wasm with clean JSON', async () => {
	await withProject('pub fn probe() -> u32 { 42 }', async (project) => {
		const output = `${project}/chosen output/plugin #.wasm`;
		const result = await runCommand(buildWasm, /* dprint-ignore */ [
			'--json', '--quiet', output, '--',
			'--manifest-path', `${project}/Cargo.toml`, '--offline',
		], { stat });
		assertEquals(result.exitCode, 0);
		assertEquals(JSON.parse(result.stdout.join('\n')), { output });
		assertEquals(result.stderr, []);
		assertEquals([...((await Deno.readFile(output)).slice(0, 4))], [0, 97, 115, 109]);
	});
});

Deno.test('build-wasm: preserves Cargo failure code and previous output', async () => {
	await withProject('pub fn invalid() { let _ = nonexistent_probe_value; }', async (project) => {
		const output = `${project}/plugin.wasm`;
		await Deno.writeTextFile(output, 'previous artifact');
		const result = await runCommand(buildWasm, /* dprint-ignore */ [
			output, '--',
			'--manifest-path', `${project}/Cargo.toml`, '--offline',
		], { stat });
		assertEquals(result.exitCode, 101);
		assertEquals(result.stdout, []);
		assertEquals(await Deno.readTextFile(output), 'previous artifact');
	});
});
