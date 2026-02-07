# WeCare Server

Backend server for the WeCare Baby Nanny Booking App. Built with Node.js, Express, and MongoDB.

## Features

- 📱 Phone number authentication with OTP
- 🔐 Firebase Admin SDK integration
- 📊 MongoDB for data storage
- 🚀 RESTful API endpoints

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **MongoDB** (v6 or higher) - [Download](https://www.mongodb.com/try/download/community)
- **npm** or **yarn**

## Installation

1. **Navigate to the server directory:**
   ```bash
   cd wecare-server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration.

4. **Start MongoDB:**
   ```bash
   # macOS (with Homebrew)
   brew services start mongodb-community
   
   # Or run directly
   mongod --dbpath /path/to/your/data/directory
   ```

5. **Run the server:**
   ```bash
   # Development mode (with hot reload)
   npm run dev
   
   # Production mode
   npm start
   ```

The server will start on `http://localhost:5000`

---

## 🔥 Firebase Setup Instructions

Follow these steps to set up Firebase for OTP authentication:

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Enter project name: `WeCare` (or your preferred name)
4. Enable/disable Google Analytics (optional)
5. Click **"Create project"**

### Step 2: Enable Phone Authentication

1. In Firebase Console, go to **Authentication** (left sidebar)
2. Click **"Get started"**
3. Go to **"Sign-in method"** tab
4. Click on **"Phone"**
5. **Enable** the toggle
6. Click **"Save"**

### Step 3: Add Your Android App

1. In Firebase Console, click the **gear icon** → **Project settings**
2. Scroll down and click **"Add app"** → **Android icon**
3. Enter your Android package name: `com.wecare`
4. (Optional) Enter app nickname: `WeCare Android`
5. (Optional) Enter SHA-1 certificate (required for production):
   ```bash
   # Get debug SHA-1
   cd android && ./gradlew signingReport
   ```
6. Click **"Register app"**
7. Download `google-services.json`
8. Place it in `/WeCare/android/app/google-services.json`

### Step 4: Add Your iOS App (Optional)

1. Click **"Add app"** → **iOS icon**
2. Enter iOS bundle ID: `com.wecare`
3. Download `GoogleService-Info.plist`
4. Add it to your Xcode project

### Step 5: Generate Service Account Key (For Server)

1. In Firebase Console, click **gear icon** → **Project settings**
2. Go to **"Service accounts"** tab
3. Click **"Generate new private key"**
4. Click **"Generate key"** to download the JSON file
5. Rename it to `firebase-service-account.json`
6. Place it in `/wecare-server/firebase-service-account.json`

### Step 6: Configure React Native App

1. **Install Firebase packages in your React Native app:**
   ```bash
   cd WeCare
   npm install @react-native-firebase/app @react-native-firebase/auth
   ```

2. **Android Setup:**
   
   Edit `android/build.gradle`:
   ```gradle
   buildscript {
     dependencies {
       // Add this line
       classpath 'com.google.gms:google-services:4.4.0'
     }
   }
   ```
   
   Edit `android/app/build.gradle`:
   ```gradle
   // Add at the bottom
   apply plugin: 'com.google.gms.google-services'
   ```

3. **Rebuild the app:**
   ```bash
   cd android && ./gradlew clean
   cd .. && npx react-native run-android
   ```

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-otp` | Send OTP to phone number |
| POST | `/api/auth/verify-otp` | Verify OTP and login/register |
| POST | `/api/auth/resend-otp` | Resend OTP |
| GET | `/api/auth/user/:id` | Get user by ID |

### Request Examples

**Send OTP:**
```bash
curl -X POST http://localhost:5000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "9876543210"}'
```

**Verify OTP:**
```bash
curl -X POST http://localhost:5000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "9876543210", "otp": "123456"}'
```

---

## Testing

In development mode, the OTP is returned in the API response for testing purposes.

Example response:
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "phoneNumber": "9876543210",
    "expiresIn": 300,
    "otp": "123456"  // Only in development
  }
}
```

---

## Project Structure

```
wecare-server/
├── src/
│   ├── config/
│   │   ├── database.js     # MongoDB connection
│   │   └── firebase.js     # Firebase Admin SDK
│   ├── models/
│   │   ├── User.js         # User schema
│   │   └── OTP.js          # OTP schema
│   ├── routes/
│   │   └── auth.js         # Authentication routes
│   └── index.js            # Server entry point
├── .env                    # Environment variables
├── .env.example            # Environment template
├── .gitignore
├── package.json
└── README.md
```

---

## Troubleshooting

### MongoDB Connection Issues

1. Make sure MongoDB is running:
   ```bash
   # Check if MongoDB is running
   brew services list | grep mongodb
   
   # Start MongoDB
   brew services start mongodb-community
   ```

2. Verify connection string in `.env`:
   ```
   MONGODB_URI=mongodb://localhost:27017/wecare
   ```

### Firebase Errors

1. Ensure `firebase-service-account.json` exists in the server root
2. Check the path in `.env`:
   ```
   FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
   ```

### Network Errors on React Native

1. For Android emulator, the server URL should use `10.0.2.2`:
   ```javascript
   const API_BASE_URL = 'http://10.0.2.2:5000/api';
   ```

2. For physical device, use your computer's local IP:
   ```javascript
   const API_BASE_URL = 'http://192.168.x.x:5000/api';
   ```

---

## License

ISC
# Wecare_server
# Wecare_server
# Wecare_server
