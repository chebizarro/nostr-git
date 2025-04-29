import { readdirSync, statSync, writeFileSync } from 'fs';

import path from 'path-browserify';
const { join, basename } = path;


const COMPONENTS_DIR = './ui/src/lib';
const STORIES_DIR = './src/stories';

function* walk(dir: string): Generator<string> {
  for (const file of readdirSync(dir)) {
    const full = join(dir, file);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith('.svelte')) yield full;
  }
}

function componentNameFromPath(path: string): string {
  return basename(path).replace('.svelte', '');
}

for (const path of walk(COMPONENTS_DIR)) {
  const name = componentNameFromPath(path);
  const out = join(STORIES_DIR, `${name}.stories.svelte`);

  const story = `<script>
  import ${name} from '${path.replace(/^\.\/src\//, '../')}';
</script>

<Meta title="Components/${name}" component={${name}} />

<Story name="Default">
  <${name} />
</Story>
`;

  writeFileSync(out, story);
  console.log(`Generated story: ${out}`);
}
