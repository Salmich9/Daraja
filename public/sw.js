// Service worker minimal : notifications seulement. Aucun cache, aucune écoute de « fetch » :
// il ne peut pas figer l'appli. Retour arrière : remplacer ce fichier par sw-uninstall.js.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = {} }
  e.waitUntil(self.registration.showNotification(d.title || 'Daraja', {
    body: d.body || '', tag: d.tag || 'daraja', renotify: true,
    icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: d.url || '/' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of list) { if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(url); return } }
    await self.clients.openWindow(url)
  })())
})
