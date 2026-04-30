"""
keep_alive.py
─────────────
سيرفر Flask بسيط يُبقي render نشطاً
render ينام الخدمات المجانية بعد 15 دقيقة من عدم النشاط،
هذا الملف يوفر endpoint يمكن ping-ه من خدمة مثل UptimeRobot.
"""

import threading
from flask import Flask

app = Flask(__name__)


@app.route("/")
def home():
    return "✅ Bot is running!", 200


@app.route("/health")
def health():
    return {"status": "ok"}, 200


def run():
    app.run(host="0.0.0.0", port=8080, debug=False, use_reloader=False)


def keep_alive():
    t = threading.Thread(target=run, daemon=True)
    t.start()
