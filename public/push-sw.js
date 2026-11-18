self.addEventListener('push', (event) => {
  const aviso = event.data?.json();
  if (!aviso?.id) return;

  event.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.mensagem,
      icon: '/sllogo.png',
      tag: `reserva-${aviso.id}`,
      data: { id: aviso.id },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const id = event.notification.data?.id;
  if (!id) return;

  const url = new URL('/', self.location.origin);
  url.searchParams.set('reserva', id);

  event.waitUntil(self.clients.openWindow(url.href));
});