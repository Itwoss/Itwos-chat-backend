# Backend - Chat App

Express.js backend server for the Chat App.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```env
PORT=5001
MONGODB_URI=mongodb://localhost:27017/chatapp
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRE=7d
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

3. Start the server:
```bash
npm run dev
```

## API Endpoints

### User Routes
- `POST /api/user/register` - Register new user
- `POST /api/user/login` - User login
- `GET /api/user/me` - Get current user (protected)
- `POST /api/user/logout` - User logout (protected)

### Admin Routes
- `POST /api/admin/login` - Admin login
- `GET /api/admin/me` - Get current admin (protected)
- `POST /api/admin/logout` - Admin logout (protected)

## Project Structure

```
backend/
├── controllers/     # Route controllers
├── middleware/      # Authentication middleware
├── models/          # MongoDB models
├── routes/          # API routes
├── utils/           # Utility functions
└── server.js        # Entry point
```

