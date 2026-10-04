#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");
if (!existsSync(index)) throw new Error("Missing static build input: " + index);

// Complete 3D is mandatory before entry, so all startup JS is required anyway.
// Deliver it with the document to remove extra high-latency script round trips.
// Keep the scene preload before the large inline script so downloading overlaps.
let html=readFileSync(index,'utf8');
const preloads=[...html.matchAll(/<link\b[^>]*as="fetch"[^>]*>/g)].map(match=>match[0]).join('\n');
html=html.replace(/<link\b[^>]*(?:as="fetch"|rel="modulepreload")[^>]*>/g,'');
html=html.replace('<head>','<head>\n'+preloads);
html=html.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,(_tag,url)=>{
  const css=readFileSync(path.join(dist,'client',url),'utf8');
  return '<style>'+css+'</style>';
});
html=html.replace(/<script\b[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,(_tag,url)=>{
  const js=readFileSync(path.join(dist,'client',url),'utf8').replace(/<\/script/gi,'<\\/script');
  return '<script type="module" data-build="'+path.basename(url)+'">'+js+'</script>';
});
writeFileSync(index,html);

console.log("Prepared static HTML with startup styles, scripts and scene preload.");
