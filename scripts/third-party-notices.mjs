import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Collect rendered JavaScript modules and imported font CSS from the build.
export function thirdPartyNotices() {
  let root;
  let notices;
  return {
    name: 'third-party-notices',
    apply: 'build',
    configResolved(config) { root = config.root; },
    generateBundle(_options, bundle) {
      const packages = new Map();
      const missing = new Set();
      const overrideDirectory = path.join(root, 'scripts/license-overrides');
      const overrides = JSON.parse(readFileSync(path.join(overrideDirectory, 'manifest.json'), 'utf8'));
      const modules = new Set(Object.values(bundle).filter(item => item.type === 'chunk')
        .flatMap(chunk => Object.entries(chunk.modules).filter(([, info]) => info.renderedLength > 0).map(([id]) => id)));
      for (const id of this.getModuleIds()) if (id.includes('/@fontsource/') && id.endsWith('.css')) modules.add(id);
      // Tailwind emits CSS through its Vite plugin rather than a runtime JS import.
      modules.add(path.join(root, 'node_modules/tailwindcss/package.json'));
      for (const id of modules) {
        if (!id.includes('/node_modules/') || id.startsWith('\0')) continue;
        let directory = path.dirname(id.split('?')[0]);
        while (directory !== path.dirname(directory)) {
          const manifest = path.join(directory, 'package.json');
          if (existsSync(manifest)) {
            const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
            if (pkg.name && pkg.version) {
              const key = `${pkg.name}@${pkg.version}`;
              if (!packages.has(key)) {
                const files = readdirSync(directory).filter(name => /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/i.test(name)).sort();
                const texts = files.map(name => ({ name, text: readFileSync(path.join(directory, name), 'utf8') }));
                if (!texts.length && overrides[key]) {
                  const override = overrides[key];
                  const text = readFileSync(path.join(overrideDirectory, override.file), 'utf8');
                  if (createHash('sha256').update(text).digest('hex') !== override.sha256) throw new Error(`License integrity mismatch: ${key}`);
                  texts.push({ name: `${override.file}\nUpstream source: ${override.source}`, text });
                }
                if (!texts.length) missing.add(key);
                packages.set(key, { pkg, files: texts });
              }
              break;
            }
          }
          directory = path.dirname(directory);
        }
      }
      if (missing.size) throw new Error(`Missing third-party license texts: ${[...missing].sort().join(', ')}`);
      if (!['react@', '@fontsource/instrument-serif@', '@fontsource/dm-sans@'].every(prefix => [...packages.keys()].some(key => key.startsWith(prefix)))) {
        throw new Error('Incomplete third-party dependency graph');
      }
      const blocks = [
        'THIRD-PARTY NOTICES — hoho Portfolio',
        'This file contains upstream copyright and license texts for packages with rendered JavaScript modules or imported font CSS in the website build, Tailwind CSS, and separately hosted fonts. It does not grant a license to the original site content, personal images, 3D assets, or third-party music. Music permissions are outside the scope of these software/font notices.',
        'The notices are generated from the installed, lockfile-resolved packages during the production build. Do not replace them with a blanket license for the whole website.',
      ];
      for (const [key, { pkg, files }] of [...packages].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
        blocks.push(`=== ${key} ===\nDeclared license: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license ?? pkg.licenses ?? 'See upstream text')}`);
        for (const file of files) blocks.push(`--- ${file.name} ---\n${file.text.trimEnd()}`);
      }
      // Vendored libraries can have a different author/license from their package.
      for (const [key, override] of Object.entries(overrides)) {
        if (!override.module) continue;
        const module = [...modules].find(id => id.endsWith('/' + override.module));
        if (!module) continue;
        if (createHash('sha256').update(readFileSync(module)).digest('hex') !== override.moduleSha256) {
          throw new Error(`Vendored module changed; review license provenance: ${key}`);
        }
        const text = readFileSync(path.join(overrideDirectory, override.file), 'utf8');
        if (createHash('sha256').update(text).digest('hex') !== override.sha256) throw new Error(`License integrity mismatch: ${key}`);
        blocks.push(`=== Vendored library: ${key} ===\nUpstream source: ${override.source}\n\n${text.trimEnd()}`);
      }
      for (const name of ['Caveat-OFL.txt', 'LXGWWenKaiTC-OFL.txt']) {
        blocks.push(`=== Hosted font: ${name} ===\n${readFileSync(path.join(root, 'public/assets/fonts', name), 'utf8').trimEnd()}`);
      }
      notices = blocks.join('\n\n') + '\n';
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source: notices });
      this.info(`Collected license texts for ${packages.size} dependency packages and two hosted fonts.`);
    },
    writeBundle() {
      writeFileSync(path.join(root, 'THIRD_PARTY_NOTICES.txt'), notices);
    },
  };
}
