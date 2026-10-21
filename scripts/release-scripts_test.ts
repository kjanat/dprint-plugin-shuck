import { CLIError } from '@kjanat/dreamcli';
import { createDenoAdapter } from '@kjanat/dreamcli/runtime';
import { runCommand } from '@kjanat/dreamcli/testkit';
import { assert, assertEquals, assertStringIncludes, assertThrows } from '@std/assert';
import { join } from '@std/path';
import { parse } from '@std/toml';
import { previousLockfile, releaseNotes, releaseTitle, shuckVersion, upstreamSection } from './release-notes.ts';
import { verifyRelease } from './verify-release.ts';

const { stat } = createDenoAdapter();
const manifest = parse(await Deno.readTextFile(new URL('../Cargo.toml', import.meta.url)));
const { version } = manifest.package as { version: string };

async function withArtifacts(action: (directory: string) => Promise<void>) {
	const directory = await Deno.makeTempDir({ prefix: 'shuck-release-cli-' });
	try {
		await Deno.writeTextFile(
			join(directory, 'schema.json'),
			JSON.stringify({
				$id: `https://plugins.dprint.dev/kjanat/shuck/${version}/schema.json`,
			}),
		);
		await action(directory);
	} finally {
		await Deno.remove(directory, { recursive: true });
	}
}

Deno.test('verify-release: help, required tag, and tag syntax', async () => {
	const help = await runCommand(verifyRelease, ['--help']);
	assertEquals(help.exitCode, 0);
	assertStringIncludes(help.stdout.join('\n'), 'ARTIFACT_DIR');
	assertEquals(help.stderr, []);
	for (const argv of [[], ['v1.2.3'], ['1.2'], ['1.2.3-rc.1']]) {
		const invalid = await runCommand(verifyRelease, argv);
		assertEquals(invalid.exitCode, 2);
		assertEquals(invalid.stdout, []);
		assertStringIncludes(invalid.stderr.join('\n'), 'tag');
	}
});

Deno.test('verify-release: environment and explicit artifact directories with JSON output', async () => {
	await withArtifacts(async (directory) => {
		const options = { stat, env: { ARTIFACT_DIR: directory } };
		const fromEnv = await runCommand(verifyRelease, ['--json', '--quiet', version], options);
		assertEquals(fromEnv.exitCode, 0);
		assertEquals(JSON.parse(fromEnv.stdout.join('\n')), {
			tag: version,
			version,
			schema: join(directory, 'schema.json'),
		});
		assertEquals(fromEnv.stderr, []);

		const explicit = await runCommand(verifyRelease, [version, directory], {
			stat,
			env: { ARTIFACT_DIR: join(directory, 'missing') },
		});
		assertEquals(explicit.exitCode, 0);
		assertEquals(explicit.stdout, []);
		assertStringIncludes(explicit.stderr.join('\n'), `Verified release ${version}`);
	});
});

Deno.test('verify-release: version and schema mismatches produce structured errors', async () => {
	await withArtifacts(async (directory) => {
		const wrongTag = version === '999.0.0' ? '998.0.0' : '999.0.0';
		const mismatch = await runCommand(verifyRelease, ['--json', wrongTag, directory], { stat });
		assertEquals(mismatch.exitCode, 1);
		assertEquals(JSON.parse(mismatch.stdout.join('\n')).error.code, 'VERSION_MISMATCH');
		assertEquals(mismatch.stderr, []);

		await Deno.writeTextFile(join(directory, 'schema.json'), JSON.stringify({ $id: 'wrong-version' }));
		const wrongSchema = await runCommand(verifyRelease, ['--json', version, directory], { stat });
		assertEquals(wrongSchema.exitCode, 1);
		assertEquals(JSON.parse(wrongSchema.stdout.join('\n')).error.code, 'SCHEMA_MISMATCH');
	});
});

Deno.test('release-notes: help and artifact directory validation', async () => {
	const help = await runCommand(releaseNotes, ['--help']);
	assertEquals(help.exitCode, 0);
	assertStringIncludes(help.stdout.join('\n'), 'artifactDir');
	assertStringIncludes(help.stdout.join('\n'), 'ARTIFACT_DIR');
	await withArtifacts(async (directory) => {
		for (const path of [join(directory, 'missing'), join(directory, 'schema.json')]) {
			const invalid = await runCommand(releaseNotes, [path], { stat });
			assertEquals(invalid.exitCode, 2);
			assertEquals(invalid.stdout, []);
		}
	});
});

Deno.test('release-notes: invalid Wasm preserves existing notes and returns a JSON error', async () => {
	await withArtifacts(async (directory) => {
		await Deno.writeTextFile(join(directory, 'plugin.wasm'), 'invalid wasm');
		const notesPath = join(directory, 'release-notes.md');
		await Deno.writeTextFile(notesPath, 'previous release notes');
		const result = await runCommand(releaseNotes, ['--json', '--quiet'], {
			stat,
			env: { ARTIFACT_DIR: directory },
		});
		assertEquals(result.exitCode, 1);
		assert(JSON.parse(result.stdout.join('\n')).error);
		assertEquals(result.stderr, []);
		assertEquals(await Deno.readTextFile(notesPath), 'previous release notes');
	});
});

Deno.test('release-notes: Shuck section appears only when the bundled version changed', () => {
	assertEquals(upstreamSection(undefined, '0.2.7'), '');
	assertEquals(upstreamSection('0.2.7', '0.2.7'), '');
	const section = upstreamSection('0.2.3', '0.2.7');
	assertStringIncludes(section, '## Shuck 0.2.3 to 0.2.7');
	assertStringIncludes(section, 'https://github.com/ewhauser/shuck/compare/v0.2.3...v0.2.7');
	assertStringIncludes(section, 'https://github.com/ewhauser/shuck/releases/tag/v0.2.7');
	assertEquals(releaseTitle('0.1.3', '0.2.7'), '0.1.3 - Shuck 0.2.7');
});

Deno.test('release-notes: Shuck version comes from the single resolved formatter package', () => {
	const lock = (versions: string[]) =>
		versions.map((version) => `[[package]]\nname = "shuck-formatter"\nversion = "${version}"\n`).join('\n');
	assertEquals(shuckVersion(lock(['0.2.7'])), '0.2.7');
	for (const versions of [[], ['0.2.5', '0.2.7']]) {
		const error = assertThrows(() => shuckVersion(lock(versions)), CLIError);
		assertEquals(error.code, 'INVALID_LOCKFILE');
	}
});

Deno.test('release-notes: previous lockfile comes from the nearest earlier release tag', async () => {
	const lock = await previousLockfile(version);
	assert(lock !== undefined);
	const previous = shuckVersion(lock);
	assert(/^\d+\.\d+\.\d+$/.test(previous), previous);
});
