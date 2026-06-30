import os

APP_META = {
    "name": "ASH",
    "version": "3.5",
    "description": "ASH AI Agent Platform",
    "creators": ["Aviraj", "Sehaj"],
    "tagline": "Autonomous. Smart. Helpful.",
}

FIREBASE_WEB_CONFIG = {
    "apiKey":            os.getenv("FIREBASE_API_KEY", ""),
    "authDomain":        os.getenv("FIREBASE_AUTH_DOMAIN", ""),
    "projectId":         os.getenv("FIREBASE_PROJECT_ID", ""),
    "storageBucket":     os.getenv("FIREBASE_STORAGE_BUCKET", ""),
    "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID", ""),
    "appId":             os.getenv("FIREBASE_APP_ID", ""),
}

SERVICE_ACCOUNT_PATH = os.getenv("FIREBASE_SERVICE_ACCOUNT", "./serviceAccountKey.json")

FIREBASE_API_KEY     = os.getenv("FIREBASE_API_KEY", "")
FIREBASE_PROJECT_ID  = os.getenv("FIREBASE_PROJECT_ID", "ash-ai-11728")
