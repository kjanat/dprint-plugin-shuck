import { CLIError } from '@kjanat/dreamcli';
import { runCommand } from '@kjanat/dreamcli/testkit';
import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert';
import { packageVersion, patchBump, releaseBump, releasePlan, setPackageVersion } from './release-bump.ts';

const manifest = (version: string) =>
	`[package]\nname         = "fixture"\nversion      = "${version}"\n\n[dependencies."shuck-formatter"]\nversion = "=0.2.7"\n`;
const lock = (shuck: string) => `version = 4\n\n[[package]]\nname = "shuck-formatter"\nversion = "${shuck}"\n`;

async function git(cwd: string, ...args: string[]) {
	const { success, stderr } = await new Deno.Command('git', {
		args: ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', ...args],
		cwd,
		env: { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
		stdout: 'null',
		stderr: 'piped',
	}).output();
	if (!success) throw new Error(new TextDecoder().decode(stderr));
}

async function commit(cwd: string, version: string, shuck: string) {
	await Deno.writeTextFile(`${cwd}/Cargo.toml`, manifest(version));
	await Deno.writeTextFile(`${cwd}/Cargo.lock`, lock(shuck));
	await git(cwd, 'add', '--all');
	await git(cwd, 'commit', '--quiet', '--message', `${version} ${shuck}`);
}

async function inRepository(action: (directory: string) => Promise<void>) {
	const directory = await Deno.makeTempDir({ prefix: 'shuck-release-bump-' });
	const cwd = Deno.cwd();
	try {
		await git(directory, 'init', '--quiet');
		Deno.chdir(directory);
		await action(directory);
	} finally {
		Deno.chdir(cwd);
		await Deno.remove(directory, { recursive: true });
	}
}

async function plan(...argv: string[]) {
	const result = await runCommand(releaseBump, ['--json', ...argv]);
	assertEquals(result.stderr, []);
	return { exitCode: result.exitCode, json: JSON.parse(result.stdout.join('\n')) };
}

Deno.test('release-bump: patch versions and manifest edits', () => {
	assertEquals(patchBump('0.1.3'), '0.1.4');
	assertEquals(patchBump('1.9.19'), '1.9.20');
	for (const version of ['0.1', 'v0.1.3', '0.1.3-rc.1']) {
		assertEquals(assertThrows(() => patchBump(version), CLIError).code, 'INVALID_MANIFEST');
	}
	assertEquals(packageVersion(manifest('0.1.3')), '0.1.3');
	assertEquals(setPackageVersion(manifest('0.1.3'), '0.1.4'), manifest('0.1.4'));
	const dependencyOnly = '[package]\nname = "fixture"\n\n[dependencies.serde]\nversion = "1"\n';
	assertEquals(assertThrows(() => packageVersion(dependencyOnly), CLIError).code, 'INVALID_MANIFEST');
	assertEquals(assertThrows(() => setPackageVersion(dependencyOnly, '0.1.4'), CLIError).code, 'INVALID_MANIFEST');
});

Deno.test('release-bump: plan follows the Shuck version and the package tag', () => {
	assertEquals(releasePlan('0.1.3', true, '0.2.7', '0.2.7'), { release: false });
	assertEquals(releasePlan('0.1.4', false, '0.2.7', '0.2.7'), { release: false });
	assertEquals(releasePlan('0.1.3', true, '0.2.8', '0.2.7'), {
		release: true,
		version: '0.1.4',
		bump: true,
		shuck: '0.2.8',
	});
	assertEquals(releasePlan('0.2.0', false, '0.2.8', '0.2.7'), {
		release: true,
		version: '0.2.0',
		bump: false,
		shuck: '0.2.8',
	});
});

Deno.test('release-bump: a repository without release tags fails', async () => {
	await inRepository(async (directory) => {
		await commit(directory, '0.1.3', '0.2.7');
		const result = await plan();
		assertEquals(result.exitCode, 1);
		assertEquals(result.json.error.code, 'NO_RELEASE');
	});
});

Deno.test('release-bump: Shuck bumps release the next patch version once', async () => {
	await inRepository(async (directory) => {
		await commit(directory, '0.1.3', '0.2.7');
		await git(directory, 'tag', '--annotate', '0.1.3', '--message', 'Release 0.1.3');
		assertEquals(await plan(), { exitCode: 0, json: { release: false } });

		await commit(directory, '0.1.3', '0.2.8');
		assertEquals(await plan(), {
			exitCode: 0,
			json: { release: true, version: '0.1.4', bump: true, shuck: '0.2.8' },
		});
		assertEquals(await Deno.readTextFile('Cargo.toml'), manifest('0.1.4'));

		assertEquals(await plan(), {
			exitCode: 0,
			json: { release: true, version: '0.1.4', bump: false, shuck: '0.2.8' },
		});
		const pending = await runCommand(releaseBump, []);
		assertEquals(pending.exitCode, 0);
		assertStringIncludes(pending.stdout.join('\n'), 'Release 0.1.4 with Shuck 0.2.8.');
		assertEquals(await Deno.readTextFile('Cargo.toml'), manifest('0.1.4'));

		await commit(directory, '0.1.4', '0.2.8');
		await git(directory, 'tag', '--annotate', '0.1.4', '--message', 'Release 0.1.4');
		assertEquals(await plan(), { exitCode: 0, json: { release: false } });
		const text = await runCommand(releaseBump, []);
		assertEquals(text.exitCode, 0);
		assertStringIncludes(text.stdout.join('\n'), 'Shuck is unchanged since 0.1.4.');
	});
});
