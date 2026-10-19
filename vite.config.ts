import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({ server: { port: 1420, strictPort: true }, plugins: [react(), tailwindcss(), { name: 'goxplan-offline', generateBundle(_options, bundle) {
  const assets = ['./', ...Object.keys(bundle).filter(x => !x.endsWith('.map')).map(x => `./${x}`)]
  const source = `const CACHE='goxplan-v1';const ASSETS=${JSON.stringify(assets)};self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response})))})`
  this.emitFile({ type: 'asset', fileName: 'sw.js', source })
} }], base: './', test: { environment: 'node' } })
