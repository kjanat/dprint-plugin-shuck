#!/usr/bin/env -S deno run --frozen -RWE --allow-run=cargo
import { arg, cli, CLIError, command } from '@kjanat/dreamcli';
import { dirname, fromFileUrl, relative, resolve } from '@std/path';
const relativePath = (import.meta.filename) ? relative(Deno.cwd(), import.meta.filename) : 'unknown script path';

const root = new URL('../', import.meta.url);

interface CargoMessage {
	reason: string;
	target?: { name: string };
	filenames?: string[];
}

export const buildWasm = command('build-wasm')
	.description("Build the Wasm plugin and stage Cargo's reported artifact.")
	.arg(
		'output',
		arg.path({ type: 'file', mustExist: false }).describe('Destination path, relative to the repository root.'),
	)
	.arg('cargoArgs', arg.string().variadic().default([]).describe('Arguments forwarded to cargo wasm-json after --.'))
	.example(({ name }) => `${name} target/artifacts/plugin.wasm`, 'Build and stage the plugin.')
	.example(({ name }) => `${name} target/artifacts/plugin.wasm -- --offline`, 'Forward options to Cargo.')
	.action(async ({ args, out }) => {
		const result = await new Deno.Command('cargo', {
			args: ['wasm-json', ...args.cargoArgs],
			cwd: root,
			stdout: 'piped',
			stderr: 'inherit',
		}).output();
		if (!result.success) {
			out.setExitCode(result.code);
			return;
		}

		const artifacts = new Set<string>();
		for (const line of new TextDecoder().decode(result.stdout).trim().split('\n')) {
			if (!line) continue;
			const message: CargoMessage = JSON.parse(line);
			if (message.reason === 'compiler-artifact' && message.target?.name === 'dprint_plugin_shuck') {
				for (const filename of message.filenames ?? []) {
					if (filename.endsWith('.wasm')) artifacts.add(filename);
				}
			}
		}
		if (artifacts.size !== 1) {
			throw new CLIError(`Expected one plugin Wasm artifact, found ${artifacts.size}.`, {
				code: 'INVALID_WASM_ARTIFACT',
				suggest: "Check that cargo wasm-json produces the plugin's .wasm artifact.",
			});
		}
		const destination = resolve(fromFileUrl(root), args.output);
		Deno.mkdirSync(dirname(destination), { recursive: true });
		Deno.copyFileSync([...artifacts][0], destination);
		out.jsonMode ? out.json({ output: destination }) : out.log(destination);
		out.status('Staged compiler output.');
	});

export const app = cli(relativePath).default(buildWasm);

if (import.meta.main) await app.run();
