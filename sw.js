// sw.js - Service Worker for PWA offline support
const CACHE_NAME = 'preco-facil-v30';
const FILES_TO_CACHE = [
    '/store_profile.html',
    '/admin.html',
    '/assets/style.css',
    '/assets/app.js',
    '/manifest.json'
];

self.addEventListener('install', (evt) => {
    evt.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Tentar adicionar os arquivos locais; falhas em recursos externos não bloqueiam a instalação
            try {
                await cache.addAll(FILES_TO_CACHE);
            } catch (err) {
                console.warn('Alguns recursos não puderam ser cacheados na instalação:', err);
            }
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
    evt.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
    if (evt.request.method !== 'GET') return;
    evt.respondWith(
        caches.match(evt.request).then((response) => {
            return response || fetch(evt.request);
        })
    );
});
