import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = JSON.parse(readFileSync(new URL('./release-large-assets.json', import.meta.url), 'utf8'));
for (const asset of assets) {
  const data = Buffer.concat(asset.parts.map(part => readFileSync(path.join(root, part))));
  if (data.length !== asset.size || createHash('sha256').update(data).digest('hex') !== asset.sha256) {
    throw new Error(`Release asset integrity check failed: ${asset.target}`);
  }
  const target = path.join(root, asset.target);
  mkdirSync(path.dirname(target), {recursive: true});
  writeFileSync(target, data);
}
