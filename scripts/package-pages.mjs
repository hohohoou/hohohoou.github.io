import {cpSync, existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'dist/client');
const destination = path.join(root, 'dist/pages');
if (!existsSync(path.join(source, 'index.html'))) throw new Error('Run the production build first.');
rmSync(destination, {recursive: true, force: true});
mkdirSync(destination, {recursive: true});
cpSync(source, destination, {
  recursive: true,
  filter(file) {
    const relative = path.relative(source, file);
    return relative !== '_headers' && relative !== '.build-evidence' && !relative.startsWith('.build-evidence' + path.sep);
  },
});
writeFileSync(path.join(destination, '.nojekyll'), '');
console.log('Prepared dist/pages; validation evidence stays in dist/client.');
