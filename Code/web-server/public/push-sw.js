self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: "Brita Alert", body: event.data.text() } };
  }

  const title = payload?.notification?.title || "Brita Alert";
  const body = payload?.notification?.body || "Water level is low.";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: payload?.data || {},
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
      return null;
    })
  );
});