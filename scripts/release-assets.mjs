import {existsSync, readFileSync, readdirSync, rmSync, statSync} from 'node:fs';
import path from 'node:path';
import {createChunkPlan, createCompressedModelPlan, SINGLE_FILE_LIMIT, modelTransportModule, resolvedModelTransportModule, modelTransportManifest} from './model-chunks.mjs';
import {replaceModelTextures} from './web-model-textures.mjs';
import {optimizeModelGeometry} from './web-model-geometry.mjs';

// Retain full references in public for local QA; production uses the display copies.
export const developmentOnlyModels = [
  'assets/knit/hoho-knit.glb',
  'assets/knit/hoho-eye-rig.glb',
  'assets/knit/lid-knit.glb',
  'assets/knit/jar-base.glb',
];

export function omitDevelopmentModels() {
  let config;
  let transports = {};
  let webImageOriginals = [];
  let openingImages = [];
  let openingPack = null;
  return {
    name: 'omit-development-models',
    configResolved(resolved) { config = resolved; },
    async buildStart() {
      transports = {};
      webImageOriginals = [];
      openingImages = [];
      openingPack = null;
      if (config.command !== 'build' || !config.publicDir) return;
      const plans=[];
      const imageReport = path.resolve(config.publicDir, '../assets/web-images-report.json');
      if (existsSync(imageReport)) {
        for (const image of JSON.parse(readFileSync(imageReport, 'utf8'))) {
          if (!existsSync(path.join(config.publicDir, image.output.slice(1)))) throw new Error(`Missing web image: ${image.output}`);
          webImageOriginals.push(image.source.slice(1));
          if(image.source.startsWith('/assets/pins/') || /\/(ground-knit|ivory-knit|hoho-tag|hoho-knit-label|lets-chat-knit-label)\.png$/.test(image.source)) openingImages.push(image.output);
        }
      }
      if(openingImages.length){
        const parts=[],entries=[];let byteOffset=0;
        for(const url of openingImages){
          const bytes=readFileSync(path.join(config.publicDir,url.slice(1)));
          entries.push({url,byteOffset,byteLength:bytes.length});parts.push(bytes);byteOffset+=bytes.length;
        }
        const plan=createChunkPlan(Buffer.concat(parts),'/assets/opening-images.glb');
        openingPack={transport:plan.transport,entries};
        plans.push(plan);
      }
      const textureDirectory = path.resolve(config.publicDir, '../assets/web-textures');
      const manifestPath = path.join(textureDirectory, 'manifest.json');
      const textures = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
      const geometryReports = [];
      for (const relative of readdirSync(config.publicDir, {recursive:true})) {
        const normalized = relative.split(path.sep).join('/');
        if (!normalized.endsWith('.glb') || developmentOnlyModels.includes(normalized)) continue;
        const sourcePath = path.join(config.publicDir, relative);
        const url = '/' + normalized;
        if (!statSync(sourcePath).isFile() || (!textures[url] && normalized !== 'assets/knit/flowers.glb' && statSync(sourcePath).size <= SINGLE_FILE_LIMIT)) continue;
        const textured = replaceModelTextures(readFileSync(sourcePath), textures[url], textureDirectory);
        const {bytes, report} = await optimizeModelGeometry(textured, url);
        if (report) geometryReports.push(report);
        const plan = report ? createCompressedModelPlan(bytes, url) : createChunkPlan(bytes, url);
        transports[url] = plan.transport;
        plans.push(plan);
      }
      const total=plans.reduce((sum,plan)=>sum+plan.transport.byteLength,0);
      if(plans.length>1 && total<=16*1024*1024){
        const bundle=createChunkPlan(Buffer.concat(plans.flatMap(plan=>plan.assets.map(asset=>asset.source))),'/assets/opening-scene.glb', Math.max(1024 * 1024, Math.ceil(total / 4)));
        let byteOffset=0;
        for(const plan of plans){plan.transport.bundle={transport:bundle.transport,byteOffset};byteOffset+=plan.transport.byteLength;}
        for(const asset of bundle.assets)this.emitFile(asset);
      }else for(const plan of plans)for(const asset of plan.assets)this.emitFile(asset);
      if(openingPack)this.emitFile({type:'asset',fileName:'.build-evidence/opening-images.json',source:JSON.stringify(openingPack)});
      // Build-only evidence for release validation; the app uses its bundled mapping.
      this.emitFile({type:'asset', fileName:modelTransportManifest, source:JSON.stringify(transports)});
      this.emitFile({type:'asset', fileName:'.build-evidence/web-model-geometry.json', source:JSON.stringify(geometryReports)});
      const headers = [...new Set(plans.flatMap(plan=>(plan.transport.bundle?.transport??plan.transport).chunks.map(chunk=>chunk.url)))].map(url => `${url}\n  Cache-Control: public, max-age=31536000, immutable\n`).join('\n');
      if (headers) this.emitFile({type:'asset', fileName:'_headers', source:headers});
    },
    resolveId(id) { if (id === modelTransportModule) return resolvedModelTransportModule; if(id==='virtual:hoho-opening-images')return '\0'+id; },
    load(id) { if (id === resolvedModelTransportModule) return `export default ${JSON.stringify(transports)};`; if(id==='\0virtual:hoho-opening-images')return `export default ${JSON.stringify(openingPack)};`; },
    transformIndexHtml: {
      order:'post',
      handler(_html,context) {
        if(!context.bundle)return;
        const scene=Object.values(context.bundle).find(item=>item.type==='chunk' && /\/src\/Scene\.tsx$/.test(item.facadeModuleId??''));
        const modules=scene?[scene.fileName,...scene.imports]:[];
        const downloads=[...(openingPack?[openingPack.transport]:[]),...Object.values(transports)].flatMap(model=>(model.bundle?.transport??model).chunks.map(chunk=>chunk.url));
        // Discover the scene and its required resources with the HTML, avoiding
        // an extra entry -> Scene -> model/texture network waterfall on slow links.
        return [
          ...[...new Set(modules)].map(file=>({tag:'link',attrs:{rel:'modulepreload',href:'/'+file,crossorigin:''},injectTo:'head'})),
          ...[...new Set(downloads)].map(url=>({tag:'link',attrs:{rel:'preload',as:'fetch',href:url,crossorigin:'',fetchpriority:'high'},injectTo:'head'})),
        ];
      },
    },
    writeBundle(options) {
      if (!options.dir) throw new Error('Expected a build output directory');
      for (const file of [...developmentOnlyModels, ...webImageOriginals, ...Object.keys(transports).map(url => url.slice(1))]) {
        rmSync(path.join(options.dir, file), {force:true});
      }
      // Historic design alternatives stay in public; ship only image files named
      // by the compiled app or its generated asset manifests. Keep the Site thumbnail.
      const files=readdirSync(options.dir,{recursive:true}).filter(file=>statSync(path.join(options.dir,file)).isFile());
      const references=files.filter(file=>/\.(js|css|html|json)$/.test(file)).map(file=>readFileSync(path.join(options.dir,file),'utf8')).join('\n');
      for(const file of files)if(file.startsWith('assets/') && /\.(png|webp|jpe?g)$/.test(file) && !references.includes(path.basename(file)))rmSync(path.join(options.dir,file));
    },
  };
}
