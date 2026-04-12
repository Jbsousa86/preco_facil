// sw.js - Service Worker for PWA offline support
const CACHE_NAME = 'preco-facil-v110';
const FILES_TO_CACHE = [
    '/',
    '/index.html',
    '/login.html',
    '/store_profile.html',
    '/admin.html',
    '/assets/style.css',
    '/assets/app.js',
    '/manifest.json'
];

self.addEventListener('install', (evt) => {
    evt.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            try {
                await cache.addAll(FILES_TO_CACHE);
            } catch (err) {
                console.warn('Cache error:', err);
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

// Estratégia Network First: Tenta internet primeiro, se falhar pega o cache
self.addEventListener('fetch', (evt) => {
    if (evt.request.method !== 'GET') return;

    evt.respondWith(
        fetch(evt.request).then(response => {
            // Se a rede funcionar, clona e atualiza o cache
            if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(evt.request, responseClone);
                });
            }
            return response;
        }).catch(() => {
            // Se a rede falhar, tenta o cache
            return caches.match(evt.request);
        })
    );
});
