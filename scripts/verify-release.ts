import { assert, assertEquals, assertMatch } from '@std/assert';
import { parse } from '@std/toml';

const tag = Deno.args[0];
assert(tag, 'Pass the release tag as the first argument.');
assertMatch(tag, /^\d+\.\d+\.\d+$/);
const manifest = parse(await Deno.readTextFile('Cargo.toml'));
const pkg = manifest.package as { version: string };
assertEquals(tag, pkg.version);
const schema: { $id: string } = JSON.parse(await Deno.readTextFile('artifact/schema.json'));
assert(schema.$id.endsWith(`/${pkg.version}/schema.json`));
