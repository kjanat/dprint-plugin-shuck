#!/usr/bin/env -S deno run --frozen -RWE --allow-run=git
import { cli, CLIError, command } from '@kjanat/dreamcli';
import { fromFileUrl, relative } from '@std/path';
import { parse } from '@std/toml';
import { git, lockfileAt, shuckVersion } from './release-notes.ts';

export type ReleasePlan =
	| { release: false }
	| { release: true; version: string; bump: boolean; shuck: string };

export function packageVersion(manifest: string): string {
	const { package: pkg } = parse(manifest);
	if (typeof pkg !== 'object' || pkg === null || !('version' in pkg) || typeof pkg.version !== 'string') {
		throw new CLIError('Cargo.toml has no package version.', { code: 'INVALID_MANIFEST' });
	}
	return pkg.version;
}

export function patchBump(version: string): string {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (match === null) throw new CLIError(`Invalid package version ${version}.`, { code: 'INVALID_MANIFEST' });
	const [, major, minor, patch] = match;
	return `${major}.${minor}.${Number(patch) + 1}`;
}

export function setPackageVersion(manifest: string, version: string): string {
	const updated = manifest.replace(/^(version\s*=\s*)"[^"]*"/m, `$1"${version}"`);
	if (packageVersion(updated) !== version) {
		throw new CLIError('Cargo.toml package version was not updated.', { code: 'INVALID_MANIFEST' });
	}
	return updated;
}

export function releasePlan(version: string, tagged: boolean, shuck: string, released: string): ReleasePlan {
	if (shuck === released) return { release: false };
	return tagged
		? { release: true, version: patchBump(version), bump: true, shuck }
		: { release: true, version, bump: false, shuck };
}

export const releaseBump = command('release-bump')
	.description(
		'Plan a release when Cargo.lock bundles a different Shuck version than the latest tag, bumping the patch version of a released package.',
	)
	.example(({ name }) => `${name} --json`, 'Print the release plan as JSON.')
	.action(async ({ out }) => {
		const tag = await git('describe', '--tags', '--abbrev=0');
		if (tag === undefined) throw new CLIError('No release tag found.', { code: 'NO_RELEASE' });
		const [manifest, lockText, releasedLock] = await Promise.all([
			Deno.readTextFile('Cargo.toml'),
			Deno.readTextFile('Cargo.lock'),
			lockfileAt(tag),
		]);
		const version = packageVersion(manifest);
		const tagged = (await git('tag', '--list', version)) === version;
		const plan = releasePlan(version, tagged, shuckVersion(lockText), shuckVersion(releasedLock));
		if (plan.release && plan.bump) await Deno.writeTextFile('Cargo.toml', setPackageVersion(manifest, plan.version));
		if (out.jsonMode) out.json(plan);
		else if (plan.release) out.log(`Release ${plan.version} with Shuck ${plan.shuck}.`);
		else out.log(`Shuck is unchanged since ${tag}.`);
	});

export const app = cli(relative(Deno.cwd(), fromFileUrl(import.meta.url))).default(releaseBump);

if (import.meta.main) await app.run();
