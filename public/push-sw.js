/* global self */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const title = "Urgent alert";
  event.waitUntil(self.registration.showNotification(title, { body: "Open Diver AI for the detail." }));
});
