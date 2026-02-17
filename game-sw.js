const CACHE_NAME = 'gametop-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'REGISTER_GAME_FILES') {
        const { id, files } = event.data;
        // Cache files in Cache API (memory cache is not persistent enough for SW)
        // actually for large games, Cache Storage is better.
        // We will store Response objects.
        const cache = await caches.open('gametop-games');

        const promises = Object.entries(files).map(([path, blob]) => {
            // Normalize path to ensure it starts with /game-play/{id}/
            const fullPath = `/game-play/${id}/${path}`;
            const response = new Response(blob, {
                status: 200,
                statusText: 'OK',
                headers: {
                    'Content-Type': getContentType(path)
                }
            });
            return cache.put(fullPath, response);
        });

        await Promise.all(promises);

        // Notify client
        event.ports[0].postMessage({ success: true });
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.pathname.startsWith('/game-play/')) {
        event.respondWith(async function () {
            const cache = await caches.open('gametop-games');
            const cachedResponse = await cache.match(url.pathname);
            if (cachedResponse) return cachedResponse;

            // Fallback: maybe index.html is requested as just directory?
            if (url.pathname.endsWith('/')) {
                const indexResponse = await cache.match(url.pathname + 'index.html');
                if (indexResponse) return indexResponse;
            }

            return new Response('File not found in game bundle', { status: 404 });
        }());
    }
});

function getContentType(path) {
    if (path.endsWith('.html')) return 'text/html';
    if (path.endsWith('.js')) return 'application/javascript';
    if (path.endsWith('.css')) return 'text/css';
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.jpg')) return 'image/jpeg';
    if (path.endsWith('.json')) return 'application/json';
    if (path.endsWith('.wasm')) return 'application/wasm';
    return 'application/octet-stream';
}
