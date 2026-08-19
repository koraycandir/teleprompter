/* Network-first with cache fallback: always fresh online, still opens offline. */
var CACHE = 'prompter-v2';
var SHELL = ['./', 'index.html', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function(e){
  // Precache the shell, or a first-ever offline launch has nothing to fall back to.
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(SHELL); })
      .catch(function(){})
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; })
        .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function cacheable(res){
  // A captive-portal login page answers 200 for any URL. Storing that would make
  // it the permanent offline copy of the app, so only same-origin 200s are kept.
  return res && res.ok && res.status === 200 && res.type === 'basic' && !res.redirected;
}

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;   // let the network handle anything external

  e.respondWith(
    fetch(e.request).then(function(res){
      if(cacheable(res)){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ return c.put(e.request, copy); }).catch(function(){});
      }
      return res;
    }).catch(function(){
      // Never resolve respondWith() with undefined — that is a hard network error.
      return caches.match(e.request).then(function(hit){
        if(hit) return hit;
        if(e.request.mode === 'navigate'){
          return caches.match('index.html').then(function(shell){
            return shell || caches.match('./').then(function(root){
              return root || new Response('Offline', {status: 503, headers: {'Content-Type': 'text/plain'}});
            });
          });
        }
        return new Response('Offline', {status: 503, headers: {'Content-Type': 'text/plain'}});
      });
    })
  );
});
