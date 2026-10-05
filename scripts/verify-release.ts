#!/usr/bin/env -S deno run --frozen -RE
import { arg, cli, CLIError, command } from '@kjanat/dreamcli';
import { fromFileUrl, join, relative } from '@std/path';
import { parse } from '@std/toml';

export const verifyRelease = command('verify-release')
	.description('Verify that the release tag matches the package and artifact schema versions.')
	.arg(
		'tag',
		arg.string({ pattern: /^\d+\.\d+\.\d+$/ }).describe('Release tag in MAJOR.MINOR.PATCH form, without a v prefix.'),
	)
	.arg(
		'artifactDir',
		arg.path({ type: 'directory' }).env('ARTIFACT_DIR').default('artifact').describe(
			'Directory containing schema.json.',
		),
	)
	.example(({ name }) => `${name} 0.1.2`, 'Verify the default artifact directory.')
	.action(async ({ args, out }) => {
		const schemaPath = join(args.artifactDir, 'schema.json');
		const [manifestText, schemaText] = await Promise.all([
			Deno.readTextFile('Cargo.toml'),
			Deno.readTextFile(schemaPath),
		]);
		const pkg = parse(manifestText).package as { version: string };
		if (args.tag !== pkg.version) {
			throw new CLIError(`Release tag ${args.tag} does not match package version ${pkg.version}.`, {
				code: 'VERSION_MISMATCH',
			});
		}
		const schema: { $id: string } = JSON.parse(schemaText);
		if (!schema.$id?.endsWith(`/${pkg.version}/schema.json`)) {
			throw new CLIError('The artifact schema does not match the package version.', {
				code: 'SCHEMA_MISMATCH',
				suggest: 'Use the schema generated for this release.',
			});
		}
		if (out.jsonMode) out.json({ tag: args.tag, version: pkg.version, schema: schemaPath });
		else out.status(`Verified release ${args.tag}.`);
	});

export const app = cli(relative(Deno.cwd(), fromFileUrl(import.meta.url))).default(verifyRelease);

if (import.meta.main) await app.run();
