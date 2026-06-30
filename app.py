"""
ASH — AI Agent Platform
Flask Backend  |  Firebase Auth + Firestore  |  Groq LLM
Created by Aviraj & Sehaj
"""
from __future__ import annotations

import json
import os
import requests as http_req
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from firebase_config import APP_META, FIREBASE_API_KEY, FIREBASE_WEB_CONFIG, SERVICE_ACCOUNT_PATH
from agent import Agent

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "ash-dev-secret-key-change-in-prod")

# ── Firebase Admin (Firestore) ────────────────────────────────────────────────
db = None
_admin_available = False

if Path(SERVICE_ACCOUNT_PATH).exists():
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        if not firebase_admin._apps:
            cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
            firebase_admin.initialize_app(cred)
        db = firestore.client()
        _admin_available = True
        print("[ASH] Firebase Admin SDK initialised ✓")
    except Exception as exc:
        print(f"[ASH] Firebase Admin init failed: {exc}")
else:
    print("[ASH] No serviceAccountKey.json — running in dev mode (no Firestore).")


# ── Firebase Auth REST helpers ────────────────────────────────────────────────
_AUTH_SIGN_IN  = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
_AUTH_SIGN_UP  = "https://identitytoolkit.googleapis.com/v1/accounts:signUp"
_AUTH_GET_USER = "https://identitytoolkit.googleapis.com/v1/accounts:lookup"


def _firebase_sign_in(email: str, password: str) -> dict:
    """Returns Firebase user dict or raises ValueError with message."""
    if not FIREBASE_API_KEY:
        raise ValueError("FIREBASE_API_KEY not configured.")
    resp = http_req.post(
        _AUTH_SIGN_IN,
        params={"key": FIREBASE_API_KEY},
        json={"email": email, "password": password, "returnSecureToken": True},
        timeout=8,
    )
    data = resp.json()
    if not resp.ok:
        msg = data.get("error", {}).get("message", "Authentication failed.")
        raise ValueError(_friendly_auth_error(msg))
    return data


def _firebase_sign_up(email: str, password: str) -> dict:
    """Registers a new user. Returns Firebase user dict or raises ValueError."""
    if not FIREBASE_API_KEY:
        raise ValueError("FIREBASE_API_KEY not configured.")
    resp = http_req.post(
        _AUTH_SIGN_UP,
        params={"key": FIREBASE_API_KEY},
        json={"email": email, "password": password, "returnSecureToken": True},
        timeout=8,
    )
    data = resp.json()
    if not resp.ok:
        msg = data.get("error", {}).get("message", "Registration failed.")
        raise ValueError(_friendly_auth_error(msg))
    return data


def _friendly_auth_error(code: str) -> str:
    return {
        "EMAIL_NOT_FOUND":           "No account found with that email.",
        "INVALID_PASSWORD":          "Incorrect password.",
        "INVALID_EMAIL":             "Invalid email address.",
        "USER_DISABLED":             "This account has been disabled.",
        "EMAIL_EXISTS":              "An account with this email already exists.",
        "WEAK_PASSWORD : Password should be at least 6 characters":
                                     "Password must be at least 6 characters.",
        "WEAK_PASSWORD":             "Password must be at least 6 characters.",
        "TOO_MANY_ATTEMPTS_TRY_LATER": "Too many attempts. Please try again later.",
        "INVALID_LOGIN_CREDENTIALS": "Incorrect email or password.",
    }.get(code, code.replace("_", " ").capitalize())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Firestore user helpers ────────────────────────────────────────────────────
def _upsert_user_doc(uid: str, fields: dict):
    if not db:
        return
    try:
        db.collection("users").document(uid).set(fields, merge=True)
    except Exception as exc:
        print(f"[ASH] Firestore user write error: {exc}")


def _get_user_doc(uid: str) -> dict:
    if not db:
        return {}
    try:
        doc = db.collection("users").document(uid).get()
        return doc.to_dict() or {}
    except Exception as exc:
        print(f"[ASH] Firestore user read error: {exc}")
        return {}


# ── Auth middleware ───────────────────────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("uid"):
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


def api_login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("uid"):
            return jsonify({"error": "Not authenticated"}), 401
        return f(*args, **kwargs)
    return decorated


def get_agent() -> Agent:
    return Agent(uid=session["uid"], db=db)


# ── Context processor ─────────────────────────────────────────────────────────
@app.context_processor
def inject_globals():
    user = session.get("user") or {}
    return {
        "firebase_config": json.dumps(FIREBASE_WEB_CONFIG),
        "app_meta":        APP_META,
        "current_user":    user,
    }


# ── Public page routes ────────────────────────────────────────────────────────
@app.route("/")
def index():
    if session.get("uid"):
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))


@app.route("/login")
def login():
    if session.get("uid"):
        return redirect(url_for("dashboard"))
    return render_template("login.html")


@app.route("/register")
def register():
    if session.get("uid"):
        return redirect(url_for("dashboard"))
    return render_template("register.html")


# ── Protected page routes ─────────────────────────────────────────────────────
@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html")


@app.route("/chat")
@login_required
def chat_page():
    return render_template("chat.html")


@app.route("/agent")
@login_required
def agent_page():
    return render_template("agent.html")


@app.route("/tasks")
@login_required
def tasks_page():
    return render_template("tasks.html")


@app.route("/memory")
@login_required
def memory_page():
    return render_template("memory.html")


@app.route("/settings")
@login_required
def settings_page():
    return render_template("settings.html")


@app.route("/about")
@login_required
def about():
    return render_template("about.html")


# ── API: Firebase Auth login ──────────────────────────────────────────────────
@app.route("/api/login", methods=["POST"])
def api_login():
    data     = request.get_json(silent=True) or {}
    email    = data.get("email", "").strip()
    password = data.get("password", "")
    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400
    try:
        fb = _firebase_sign_in(email, password)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 401

    uid  = fb["localId"]
    name = fb.get("displayName") or email.split("@")[0]

    # Load extra profile from Firestore
    profile = _get_user_doc(uid)
    name    = profile.get("name") or name

    now = _now_iso()
    _upsert_user_doc(uid, {"last_login": now, "email": email})

    session["uid"]  = uid
    session["user"] = {
        "uid":        uid,
        "email":      email,
        "name":       name,
        "last_login": now,
    }
    return jsonify({"ok": True, "redirect": url_for("dashboard")})


# ── API: Firebase Auth register ───────────────────────────────────────────────
@app.route("/api/register", methods=["POST"])
def api_register():
    data     = request.get_json(silent=True) or {}
    email    = data.get("email", "").strip()
    password = data.get("password", "")
    name     = data.get("name", "").strip() or email.split("@")[0]
    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400
    try:
        fb = _firebase_sign_up(email, password)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    uid = fb["localId"]
    now = _now_iso()

    # Store user profile in Firestore
    _upsert_user_doc(uid, {
        "uid":        uid,
        "email":      email,
        "name":       name,
        "created_at": now,
        "last_login": now,
        "preferences": {
            "theme":              "dark",
            "memory_enabled":     True,
            "history_enabled":    True,
        },
    })

    session["uid"]  = uid
    session["user"] = {
        "uid":        uid,
        "email":      email,
        "name":       name,
        "last_login": now,
    }
    return jsonify({"ok": True, "redirect": url_for("dashboard")})


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True, "redirect": url_for("login")})


# ── API: user profile ─────────────────────────────────────────────────────────
@app.route("/api/profile", methods=["GET"])
@api_login_required
def get_profile():
    uid  = session["uid"]
    doc  = _get_user_doc(uid)
    user = session.get("user", {})
    doc.setdefault("name",  user.get("name", ""))
    doc.setdefault("email", user.get("email", ""))
    # Count memories + chats
    agent  = get_agent()
    mems   = agent.load_memory(limit=1000)
    chats  = agent.get_chat_history(limit=1000)
    tasks  = agent.get_tasks()
    return jsonify({
        "ok":               True,
        "uid":              uid,
        "name":             doc.get("name", ""),
        "email":            doc.get("email", ""),
        "created_at":       doc.get("created_at", ""),
        "last_login":       doc.get("last_login", ""),
        "memory_count":     len(mems),
        "chat_count":       len([m for m in chats if m["role"] == "user"]),
        "task_count":       len(tasks),
        "preferences":      doc.get("preferences", {}),
    })


@app.route("/api/profile", methods=["POST"])
@api_login_required
def update_profile():
    uid  = session["uid"]
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Name cannot be empty."}), 400
    _upsert_user_doc(uid, {"name": name})
    user = session.get("user", {})
    user["name"] = name
    session["user"] = user
    return jsonify({"ok": True})


# ── API: preferences ──────────────────────────────────────────────────────────
@app.route("/api/preferences", methods=["GET"])
@api_login_required
def get_preferences():
    uid  = session["uid"]
    doc  = _get_user_doc(uid)
    prefs = doc.get("preferences", {
        "theme": "dark",
        "memory_enabled": True,
        "history_enabled": True,
    })
    return jsonify({"ok": True, "preferences": prefs})


@app.route("/api/preferences", methods=["POST"])
@api_login_required
def save_preferences():
    uid   = session["uid"]
    data  = request.get_json(silent=True) or {}
    prefs = {}
    if "theme" in data:
        prefs["theme"] = data["theme"] if data["theme"] in ("dark", "light") else "dark"
    if "memory_enabled" in data:
        prefs["memory_enabled"] = bool(data["memory_enabled"])
    if "history_enabled" in data:
        prefs["history_enabled"] = bool(data["history_enabled"])
    if prefs:
        _upsert_user_doc(uid, {"preferences": prefs})
    return jsonify({"ok": True, "preferences": prefs})


# ── API: change password (via Firebase Auth REST) ─────────────────────────────
@app.route("/api/change-password", methods=["POST"])
@api_login_required
def change_password():
    data         = request.get_json(silent=True) or {}
    new_password = data.get("new_password", "")
    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400
    # Re-authenticate first
    old_password = data.get("current_password", "")
    email        = session["user"]["email"]
    try:
        fb = _firebase_sign_in(email, old_password)
    except ValueError as exc:
        return jsonify({"error": f"Current password incorrect: {exc}"}), 401

    # Update password using the id token
    id_token = fb.get("idToken", "")
    resp = http_req.post(
        "https://identitytoolkit.googleapis.com/v1/accounts:update",
        params={"key": FIREBASE_API_KEY},
        json={"idToken": id_token, "password": new_password, "returnSecureToken": True},
        timeout=8,
    )
    if not resp.ok:
        msg = resp.json().get("error", {}).get("message", "Password update failed.")
        return jsonify({"error": _friendly_auth_error(msg)}), 400
    return jsonify({"ok": True})


# ── API: chat ─────────────────────────────────────────────────────────────────
@app.route("/api/chat", methods=["POST"])
@api_login_required
def api_chat():
    data    = request.get_json(silent=True) or {}
    message = data.get("message", "").strip()
    if not message:
        return jsonify({"error": "No message provided"}), 400
    try:
        result = get_agent().chat(message)
        return jsonify({"ok": True, "assistant": result["assistant"]})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/chat/history", methods=["GET"])
@api_login_required
def api_chat_history():
    try:
        history = get_agent().get_chat_history(limit=100)
        return jsonify({"history": history})
    except Exception as exc:
        return jsonify({"error": str(exc), "history": []}), 500


@app.route("/api/chat/clear", methods=["POST"])
@api_login_required
def api_chat_clear():
    try:
        count = get_agent().clear_chat_history()
        return jsonify({"ok": True, "deleted": count})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── API: agent ────────────────────────────────────────────────────────────────
@app.route("/api/agent/run", methods=["POST"])
@api_login_required
def agent_run():
    data       = request.get_json(silent=True) or {}
    task_input = data.get("task", "").strip()
    if not task_input:
        return jsonify({"error": "No task provided"}), 400
    try:
        record = get_agent().run_task(task_input)
        return jsonify({"ok": True, "task": record})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── API: memory ───────────────────────────────────────────────────────────────
@app.route("/api/memory", methods=["GET"])
@api_login_required
def get_memory():
    category = request.args.get("category", None)
    try:
        memories = get_agent().load_memory(category=category)
        return jsonify({"memories": memories})
    except Exception as exc:
        return jsonify({"error": str(exc), "memories": []}), 500


@app.route("/api/memory", methods=["POST"])
@api_login_required
def save_memory():
    data     = request.get_json(silent=True) or {}
    content  = data.get("content", "").strip()
    category = data.get("category", "general").strip()
    if not content:
        return jsonify({"error": "Content required"}), 400
    try:
        record = get_agent().save_memory(content, category)
        return jsonify({"ok": True, "memory": record})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/memory/<mem_id>", methods=["DELETE"])
@api_login_required
def delete_memory(mem_id):
    try:
        ok = get_agent().delete_memory(mem_id)
        return jsonify({"ok": ok})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── API: tasks ────────────────────────────────────────────────────────────────
@app.route("/api/tasks", methods=["GET"])
@api_login_required
def get_tasks():
    status = request.args.get("status", None)
    try:
        tasks = get_agent().get_tasks(status=status)
        return jsonify({"tasks": tasks})
    except Exception as exc:
        return jsonify({"error": str(exc), "tasks": []}), 500


@app.route("/api/tasks", methods=["POST"])
@api_login_required
def create_task():
    data  = request.get_json(silent=True) or {}
    title = data.get("title", "").strip()
    desc  = data.get("description", "").strip()
    if not title:
        return jsonify({"error": "Title required"}), 400
    try:
        record = get_agent().create_task(title, desc)
        return jsonify({"ok": True, "task": record})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/tasks/<task_id>", methods=["PUT"])
@api_login_required
def update_task(task_id):
    data = request.get_json(silent=True) or {}
    try:
        ok = get_agent().update_task(task_id, data)
        return jsonify({"ok": ok})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/tasks/<task_id>", methods=["DELETE"])
@api_login_required
def delete_task(task_id):
    try:
        ok = get_agent().delete_task(task_id)
        return jsonify({"ok": ok})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── API: meta ─────────────────────────────────────────────────────────────────
@app.route("/api/meta")
def meta():
    data = dict(APP_META)
    data["groq_available"]     = bool(os.getenv("GROQ_API_KEY"))
    data["firebase_available"] = _admin_available
    return jsonify(data)


# ── Legacy settings endpoint (keep for backwards compat) ──────────────────────
@app.route("/api/settings", methods=["GET", "POST"])
@api_login_required
def user_settings():
    if request.method == "GET":
        return get_profile()
    data = request.get_json(silent=True) or {}
    if "name" in data:
        return update_profile()
    return jsonify({"ok": True})


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(debug=True, host="0.0.0.0", port=port)
