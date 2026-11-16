// Retour arrière : copié à la place de sw.js, il se désinstalle tout seul sur chaque téléphone
// au prochain lancement, puis recharge l'appli normalement.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  await self.registration.unregister()
  const list = await self.clients.matchAll({ type: 'window' })
  list.forEach(c => c.navigate(c.url))
})()))
