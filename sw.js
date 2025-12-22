const CACHE_NAME = 'ilovecook-v1';
const ASSETS = [
    './',
    './index.html',
    './styles/main.css',
    './scripts/app.js',
    './scripts/filters.js',
    './scripts/storage.js',
    './data/ingredients.json',
    './data/recipes.json',
    './data/substitutes.json'
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(response => response || fetch(e.request))
    );
});
