# Push Notifications (New Message)

## Behavior

- **Backend always sends Web Push** on every new chat message (Socket + Push together). No "if offline" check – required for iOS PWA when app is closed.
- **App open** → User gets the message in real time via **Socket.io** and may also get a system notification (SW always shows push for reliability on iOS).
- **App closed, tab hidden, or phone locked** → User receives a **system notification** (web push). Works after "Add to Home Screen".

Subscriptions are stored in the **PushSubscription** collection (by `userId`), not on the User document, so they are not lost on login/update.

## Requirements

- **HTTPS** (or localhost) – required for Service Worker and Push API.
- **VAPID keys** – set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in env. Generate with: `npx web-push generate-vapid-keys`.
- **VAPID in frontend** – The public key must be converted from Base64 to `Uint8Array` before `pushManager.subscribe({ applicationServerKey })`. Passing a plain string fails silently.
- **MongoDB** – push subscriptions are stored in the `PushSubscription` collection.

## Server-side presence

- **Online** is tracked only on the server: `connectedUsers` Map in `server.js` (userId → socket.id), updated on Socket.io `connection` / `disconnect`.
- Controllers use `req.app.get('isUserConnected')(userId)` when needed. Push does not rely on this for send vs no-send; we always send. Presence is still used for other features (e.g. online status).

## Multiple devices per user

- Schema allows **multiple subscriptions per user** (one per `endpoint`). Unique index is `(userId, endpoint)`.
- Save is **upsert by `endpoint`**: `findOneAndUpdate({ endpoint }, { userId, endpoint, keys, userAgent }, { upsert: true })`. New device = new endpoint = new document.
- User clearing browser data → old subscription becomes invalid → next send returns 410 → we remove that subscription from the DB.

## Flow

1. Frontend registers the Service Worker (`/sw.js`), requests notification permission, subscribes via `pushManager.subscribe({ applicationServerKey: urlBase64ToUint8Array(publicKey) })` and sends the subscription to `POST /api/user/push-subscription`.
2. Backend upserts the subscription by `endpoint` (multiple devices per user).
3. When a new message is sent, the chat controller always calls `sendPushToUser(receiverId, payload)`.
4. Push service sends to all stored subscriptions for that user. If a send returns **410 Gone** or **404 Not Found**, that subscription is **removed from MongoDB** automatically.

## Service Worker

- On **push**: the SW **always** calls `showNotification` (no focus-based suppression). This is required for iOS PWA where "focused" can stay true when the app is backgrounded/closed, which would otherwise suppress chat notifications.
- **notificationclick** opens the app to the payload URL.

## Add to Home Screen

- PWA is supported (`manifest.json` with `display: standalone`).
- When the user has already granted notification permission and opens the app (e.g. from home screen), the frontend ensures the current push subscription is synced to the backend (re-subscribe if missing, then save).

## iOS

- Push works when: user installs from Safari, opens from home screen, and grants permission.
- Does not work in a Safari tab or on iOS &lt; 16.4.

## How to test push notifications

1. **Enable notifications (once)**  
   Log in as a user → when the notification banner appears, click **Enable** and **allow** in the browser. (If the banner was dismissed, open the app again or use another device; you can’t re-prompt from the same session.)

2. **Send a test from the app**  
   Go to **Settings** → **Notifications** → click **Send test notification**.  
   - If you see a system notification (“Test notification – If you see this, push notifications are working”), push is working.  
   - If you get “No push subscription found” or “Enable notifications first”, enable notifications (step 1) and try again.

3. **Test with a real message**  
   From another account (or another browser), send a chat message to the user. With the app **in the background** or **closed**, the user should get a system notification. (If the app is open and the chat is focused, the notification is suppressed to avoid duplicates.)

4. **Backend logs**  
   When a message is sent, the backend logs:
   - `[Chat] Sending push to receiver <id>` – push is being triggered.
   - `[Push] Sending to N subscription(s) for user <id>` – subscriptions found.
   - `[Chat] Push delivered to receiver <id> | sent: 1` – push sent successfully.
   - `[Push] No subscriptions for user <id>` – receiver has not enabled notifications on any device.

## "Server is not configured for push" (503)

This means the **API server your frontend is calling** does not have `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in its environment.

- **Testing locally:**  
  1. Put both keys in `backend/.env`.  
  2. Start the backend from the **backend** folder: `cd backend && npm run dev`.  
  3. In the terminal you should see `[Push] VAPID keys: configured`. If you see `[Push] VAPID keys: MISSING`, the process did not load the keys — fix `.env` and restart.  
  4. In the frontend `.env` set `VITE_API_URL=http://localhost:5001` and restart the frontend.  
  5. In the browser open `http://localhost:5001/api/user/push-subscription/vapid-public-key`. You should see `{"success":true,"data":{"publicKey":"..."}}`. If you see 503 or "not configured", the backend you're hitting still has no keys.

- **Using production (e.g. itwos.store):**  
  The app calls your production API (e.g. `https://api.itwos.store`). Add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to that server’s **environment variables** in your hosting dashboard (e.g. Digital Ocean → App → Settings → Environment Variables), then **redeploy** the backend.

## Notifications not working? Checklist

1. **VAPID keys** – Backend `.env` must have `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Generate: `npx web-push generate-vapid-keys`. Restart the server. If missing, the server logs: `[Push] VAPID keys missing...` and the frontend may show "System notifications unavailable".
2. **HTTPS** – Push requires a secure context (HTTPS or localhost). Plain HTTP (except localhost) will not allow subscription.
3. **User enabled** – User must click "Enable" in the notification banner and grant browser permission. Check backend logs when a message is sent: `[Push] No subscriptions for user ...` means that user has not registered a device.
4. **Service Worker** – The app registers `/sw.js` on load. In DevTools → Application → Service Workers, confirm the worker is active. Push is delivered to the SW that created the subscription.
5. **Browser** – Notifications must be allowed for the site (browser settings / site settings). Do Not Disturb or Focus mode can suppress display.
