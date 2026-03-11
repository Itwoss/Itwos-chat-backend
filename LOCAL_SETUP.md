# Local backend setup (MongoDB + .env)

Your backend is failing because **MongoDB is not running**. Fix it in one of two ways:

---

## Option A: Run MongoDB on your Mac (recommended for local dev)

### 1. Install MongoDB

```bash
brew tap mongodb/brew
brew install mongodb-community
```

### 2. Start MongoDB

```bash
brew services start mongodb-community
```

Check it's running:

```bash
brew services list
# mongodb-community should be "started"
```

Your `.env` already has `MONGODB_URI=mongodb://localhost:27017/chatapp`, so no change needed.

### 3. Restart the backend

Stop the current server (Ctrl+C in the terminal where `npm run dev` is running), then:

```bash
cd "/Users/itwos/Desktop/chat app/Itwos-chat-backend"
npm run dev
```

You should see the server start **without** `MongoDB connection error`. Login should work.

---

## Option B: Use MongoDB Atlas (cloud, no local install)

### 1. Create a free cluster

- Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
- Sign up / log in → Create a free cluster (e.g. M0)
- Create a database user (username + password)
- Under **Network Access**, add `0.0.0.0/0` (or your IP) so your app can connect

### 2. Get the connection string

- In Atlas: **Database → Connect → Connect your application**
- Copy the URI (looks like `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/`)

### 3. Put it in `.env`

Open `Itwos-chat-backend/.env` and set:

```env
MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/chatapp?retryWrites=true&w=majority
```

Replace `YOUR_USER`, `YOUR_PASSWORD`, and the cluster host with your real values. If the password has special characters, URL-encode them.

### 4. Restart the backend

```bash
cd "/Users/itwos/Desktop/chat app/Itwos-chat-backend"
npm run dev
```

---

## Summary

| Issue | Fix |
|-------|-----|
| No `.env` | Done – `.env` was created with `JWT_SECRET`, `ENCRYPTION_KEY`, etc. |
| MongoDB connection refused | Install & start MongoDB (Option A) or use Atlas (Option B) and set `MONGODB_URI` |
| Login timeout | Caused by MongoDB not connected; goes away after MongoDB is running |
| VAPID / push notifications | Optional; generate with `npx web-push generate-vapid-keys` and add to `.env` if you need them |

After MongoDB is running and the backend is restarted, try logging in again from the frontend at http://localhost:5173.
