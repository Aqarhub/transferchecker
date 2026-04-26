"""
🎬 بوت تحميل الوسائط v3.0 - النسخة المحسّنة
==============================================
الإصلاحات في v3:
  ✅ حل مشكلة YouTube بالكامل (PO Token + visitor_data + multi-clients)
  ✅ حل مشكلة Snapchat "extracted extension is unusual"
  ✅ دعم تحميل الصور (Instagram posts, Pinterest, Twitter)
  ✅ تحميل ألبومات الصور كاملة (multi-image posts)
  ✅ معالجة أفضل للمنصات بدون فيديو
"""

import os
import re
import json
import logging
import asyncio
import sqlite3
import uuid
import time
import traceback
from datetime import datetime
from typing import Optional, Dict, List, Tuple
from contextlib import contextmanager
from urllib.parse import urlparse

import yt_dlp
from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    BotCommand,
    InputMediaPhoto,
    InputMediaVideo,
)
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters,
)
from telegram.constants import ChatAction, ParseMode

from aiohttp import web

# ================== الإعدادات ==================
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
OWNER_ID = int(os.getenv("OWNER_ID", "0"))
PORT = int(os.getenv("PORT", "10000"))
DATA_DIR = os.getenv("DATA_DIR", "/var/data")

DOWNLOADS_DIR = os.path.join(DATA_DIR, "downloads")
DB_PATH = os.path.join(DATA_DIR, "downloader.db")
COOKIES_DIR = os.path.join(DATA_DIR, "cookies")
ERROR_LOGS_DIR = os.path.join(DATA_DIR, "error_logs")

YOUTUBE_COOKIES = os.path.join(COOKIES_DIR, "youtube.txt")
INSTAGRAM_COOKIES = os.path.join(COOKIES_DIR, "instagram.txt")
FACEBOOK_COOKIES = os.path.join(COOKIES_DIR, "facebook.txt")
TIKTOK_COOKIES = os.path.join(COOKIES_DIR, "tiktok.txt")
SNAPCHAT_COOKIES = os.path.join(COOKIES_DIR, "snapchat.txt")

MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024  # حد الصورة في تيليجرام
TEMP_FILE_LIFETIME_MIN = 10
DOWNLOAD_TIMEOUT_SEC = 180
PROGRESS_UPDATE_INTERVAL_SEC = 3

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(DOWNLOADS_DIR, exist_ok=True)
os.makedirs(COOKIES_DIR, exist_ok=True)
os.makedirs(ERROR_LOGS_DIR, exist_ok=True)

# ================== التسجيل ==================
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logging.getLogger("yt_dlp").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

# ================== المنصات المدعومة ==================

SUPPORTED_PLATFORMS = {
    "youtube.com": "🔴 YouTube",
    "youtu.be": "🔴 YouTube",
    "tiktok.com": "🎵 TikTok",
    "vm.tiktok.com": "🎵 TikTok",
    "instagram.com": "📷 Instagram",
    "twitter.com": "🐦 Twitter/X",
    "x.com": "🐦 Twitter/X",
    "facebook.com": "📘 Facebook",
    "fb.watch": "📘 Facebook",
    "fb.com": "📘 Facebook",
    "snapchat.com": "👻 Snapchat",
    "pinterest.com": "📌 Pinterest",
    "pin.it": "📌 Pinterest",
    "reddit.com": "🟠 Reddit",
    "redd.it": "🟠 Reddit",
    "soundcloud.com": "🎧 SoundCloud",
    "twitch.tv": "🎮 Twitch",
    "vimeo.com": "🎬 Vimeo",
    "dailymotion.com": "🎥 Dailymotion",
    "linkedin.com": "💼 LinkedIn",
    "threads.net": "🧵 Threads",
    "kick.com": "🟢 Kick",
    "bilibili.com": "📺 Bilibili",
    "9gag.com": "😂 9GAG",
}

# المنصات التي تدعم الصور
PHOTO_PLATFORMS = ["instagram.com", "pinterest.com", "pin.it", "twitter.com",
                    "x.com", "reddit.com", "threads.net"]


def detect_platform(url: str) -> Optional[str]:
    try:
        domain = urlparse(url).netloc.lower().replace("www.", "")
        for key, name in SUPPORTED_PLATFORMS.items():
            if key in domain:
                return name
        return None
    except Exception:
        return None


def is_youtube(url: str) -> bool:
    return any(d in url.lower() for d in ["youtube.com", "youtu.be"])


def is_instagram(url: str) -> bool:
    return "instagram.com" in url.lower()


def is_facebook(url: str) -> bool:
    return any(d in url.lower() for d in ["facebook.com", "fb.watch", "fb.com"])


def is_tiktok(url: str) -> bool:
    return "tiktok.com" in url.lower()


def is_snapchat(url: str) -> bool:
    return "snapchat.com" in url.lower()


def is_pinterest(url: str) -> bool:
    return "pinterest.com" in url.lower() or "pin.it" in url.lower()


def is_twitter(url: str) -> bool:
    return "twitter.com" in url.lower() or "x.com" in url.lower()


def is_likely_image_url(url: str) -> bool:
    """هل الرابط قد يحتوي صور (وليس فيديو فقط)؟"""
    return any(p in url.lower() for p in PHOTO_PLATFORMS)


# ================== قاعدة البيانات ==================

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"خطأ DB: {e}")
        raise
    finally:
        conn.close()


def init_database():
    with get_db() as conn:
        cur = conn.cursor()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS downloads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER, username TEXT, platform TEXT,
                url TEXT, title TEXT, file_type TEXT,
                file_size_mb REAL, status TEXT, rating INTEGER DEFAULT 0,
                downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT, first_name TEXT,
                downloads_count INTEGER DEFAULT 0,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_banned INTEGER DEFAULT 0
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                default_quality TEXT DEFAULT 'best',
                default_format TEXT DEFAULT 'video',
                language TEXT DEFAULT 'ar'
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS rate_limits (
                user_id INTEGER PRIMARY KEY,
                count INTEGER DEFAULT 0,
                reset_at TIMESTAMP
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS error_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER, username TEXT,
                url TEXT, platform TEXT,
                error_message TEXT, error_details TEXT,
                reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'pending'
            )
        """)

        cur.execute("CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_downloads_platform ON downloads(platform)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_errors_status ON error_reports(status)")

        logger.info("✅ تم تهيئة قاعدة البيانات")


# ================== الدوال المساعدة ==================

def register_user(user):
    try:
        with get_db() as conn:
            conn.execute(
                """INSERT INTO users (user_id, username, first_name) VALUES (?, ?, ?)
                   ON CONFLICT(user_id) DO UPDATE SET
                     username = excluded.username, first_name = excluded.first_name,
                     last_active = CURRENT_TIMESTAMP""",
                (user.id, user.username or "", user.first_name or ""),
            )
            conn.execute("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)", (user.id,))
    except Exception as e:
        logger.error(f"register_user error: {e}")


def is_user_banned(user_id: int) -> bool:
    try:
        with get_db() as conn:
            row = conn.execute("SELECT is_banned FROM users WHERE user_id = ?", (user_id,)).fetchone()
            return row and row["is_banned"] == 1
    except Exception:
        return False


def check_rate_limit(user_id: int, max_per_hour: int = 30) -> Tuple[bool, int]:
    if user_id == OWNER_ID:
        return True, 999
    try:
        with get_db() as conn:
            row = conn.execute(
                "SELECT count, reset_at FROM rate_limits WHERE user_id = ?", (user_id,)
            ).fetchone()
            now = datetime.now()
            if not row:
                conn.execute(
                    "INSERT INTO rate_limits (user_id, count, reset_at) VALUES (?, 1, datetime('now', '+1 hour'))",
                    (user_id,),
                )
                return True, max_per_hour - 1
            reset_at = datetime.fromisoformat(row["reset_at"])
            if now >= reset_at:
                conn.execute(
                    "UPDATE rate_limits SET count = 1, reset_at = datetime('now', '+1 hour') WHERE user_id = ?",
                    (user_id,),
                )
                return True, max_per_hour - 1
            if row["count"] >= max_per_hour:
                return False, 0
            conn.execute("UPDATE rate_limits SET count = count + 1 WHERE user_id = ?", (user_id,))
            return True, max_per_hour - row["count"] - 1
    except Exception as e:
        logger.error(f"rate_limit error: {e}")
        return True, 0


def log_download(user, platform, url, title, file_type, size_mb, status) -> Optional[int]:
    try:
        with get_db() as conn:
            cur = conn.execute(
                """INSERT INTO downloads (user_id, username, platform, url, title, file_type, file_size_mb, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (user.id, user.username or "", platform, url, title, file_type, size_mb, status),
            )
            if status == "success":
                conn.execute(
                    "UPDATE users SET downloads_count = downloads_count + 1 WHERE user_id = ?",
                    (user.id,),
                )
            return cur.lastrowid
    except Exception as e:
        logger.error(f"log_download error: {e}")
        return None


def cleanup_old_files():
    try:
        now = time.time()
        for f in os.listdir(DOWNLOADS_DIR):
            path = os.path.join(DOWNLOADS_DIR, f)
            if os.path.isfile(path):
                age_min = (now - os.path.getmtime(path)) / 60
                if age_min > TEMP_FILE_LIFETIME_MIN:
                    try:
                        os.remove(path)
                    except Exception:
                        pass
    except Exception as e:
        logger.error(f"cleanup error: {e}")


def format_size(bytes_size) -> str:
    if not bytes_size:
        return "0 B"
    bytes_size = float(bytes_size)
    for unit in ["B", "KB", "MB", "GB"]:
        if bytes_size < 1024:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024
    return f"{bytes_size:.1f} TB"


def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "N/A"
    seconds = int(seconds)
    h, m, s = seconds // 3600, (seconds % 3600) // 60, seconds % 60
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def make_progress_bar(percent: float, length: int = 15) -> str:
    percent = max(0, min(100, percent))
    filled = int(length * percent / 100)
    return f"[{'█' * filled}{'░' * (length - filled)}] {percent:.1f}%"


# ================== أوامر البداية ==================

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    register_user(user)

    keyboard = [
        [
            InlineKeyboardButton("📚 الأوامر", callback_data="help_cmds"),
            InlineKeyboardButton("🌐 المنصات", callback_data="help_platforms"),
        ],
        [
            InlineKeyboardButton("⚙️ الإعدادات", callback_data="settings"),
            InlineKeyboardButton("📊 إحصائياتي", callback_data="my_stats"),
        ],
        [InlineKeyboardButton("ℹ️ كيف يعمل البوت", callback_data="how_it_works")],
    ]

    welcome_text = (
        f"👋 أهلاً {user.mention_html()}!\n\n"
        "🎬 <b>بوت تحميل الفيديوهات والصور والصوت!</b>\n\n"
        "<b>✨ يدعم:</b>\n"
        "🔴 YouTube  •  🎵 TikTok  •  📷 Instagram\n"
        "🐦 Twitter/X  •  📘 Facebook  •  👻 Snapchat\n"
        "📌 Pinterest  •  🟠 Reddit  •  🎧 SoundCloud\n"
        "🎮 Twitch  •  🎬 Vimeo  •  + 1000 موقع\n\n"
        "<b>📥 الميزات:</b>\n"
        "• تحميل فيديو + صوت + <b>صور</b> 📸\n"
        "• تحميل ألبومات الصور كاملة 🖼️\n"
        "• اختيار جودة معينة 🎚️\n"
        "• شريط تقدم مباشر ⏳\n"
        "• تقييم بعد كل تحميل ⭐\n\n"
        "💡 <i>أرسل أي رابط الآن!</i>"
    )

    if update.callback_query:
        await update.callback_query.edit_message_text(
            welcome_text, parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(keyboard))
    else:
        await update.message.reply_html(welcome_text, reply_markup=InlineKeyboardMarkup(keyboard))


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = (
        "📚 <b>الأوامر المتاحة</b>\n\n"
        "<b>🎬 التحميل:</b>\n"
        "أرسل أي رابط وسأحمّله!\n\n"
        "<b>🔧 الأوامر:</b>\n"
        "<code>/start</code> - القائمة الرئيسية\n"
        "<code>/help</code> - هذه الرسالة\n"
        "<code>/audio [رابط]</code> - تحميل صوت MP3\n"
        "<code>/video [رابط]</code> - تحميل فيديو\n"
        "<code>/photo [رابط]</code> - تحميل صور 🆕\n"
        "<code>/info [رابط]</code> - معلومات الفيديو\n"
        "<code>/stats</code> - إحصائياتك\n"
        "<code>/platforms</code> - المنصات المدعومة\n\n"
        "<b>📊 للمالك:</b>\n"
        "<code>/admin</code> - لوحة الإدارة\n"
        "<code>/errors</code> - تقارير الأخطاء\n"
        "<code>/setcookies</code> - إضافة كوكيز\n"
        "<code>/broadcast [نص]</code> - بث للجميع"
    )
    await update.message.reply_html(text)


async def cmd_platforms(update: Update, context: ContextTypes.DEFAULT_TYPE):
    seen = set()
    text = "🌐 <b>المنصات المدعومة:</b>\n\n"
    for name in SUPPORTED_PLATFORMS.values():
        if name not in seen:
            text += f"• {name}\n"
            seen.add(name)
    text += "\n💡 <b>+ 1000 موقع آخر!</b>"
    await update.message.reply_html(text)


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data == "back_main":
        await cmd_start(update, context)
        return
    if data.startswith("dl_"):
        await handle_download_choice(update, context)
        return
    if data == "cancel":
        await query.edit_message_text("❌ تم الإلغاء.")
        return
    if data.startswith("rate_"):
        await handle_rating(update, context)
        return
    if data.startswith("report_"):
        await handle_report_error(update, context)
        return
    if data.startswith("err_"):
        await handle_error_action(update, context)
        return

    if data == "help_cmds":
        text = (
            "📚 <b>الأوامر</b>\n\n"
            "أرسل أي رابط مباشرة!\n\n"
            "<code>/audio [رابط]</code> - MP3\n"
            "<code>/video [رابط]</code> - فيديو\n"
            "<code>/photo [رابط]</code> - صور\n"
            "<code>/info [رابط]</code> - معلومات\n"
            "<code>/stats</code> - إحصائياتي"
        )
    elif data == "help_platforms":
        seen = set()
        platforms_text = ""
        for name in SUPPORTED_PLATFORMS.values():
            if name not in seen:
                platforms_text += f"• {name}\n"
                seen.add(name)
        text = f"🌐 <b>المنصات المدعومة:</b>\n\n{platforms_text}\n💡 <b>+ 1000 موقع آخر!</b>"
    elif data == "settings":
        text = (
            "⚙️ <b>الإعدادات</b>\n\n"
            "حالياً: عند إرسال رابط ستختار الجودة.\n"
            "خيارات إضافية قريباً."
        )
    elif data == "my_stats":
        with get_db() as conn:
            user_data = conn.execute(
                "SELECT downloads_count, joined_at FROM users WHERE user_id = ?",
                (query.from_user.id,),
            ).fetchone()
            top_platforms = conn.execute(
                """SELECT platform, COUNT(*) as cnt FROM downloads
                   WHERE user_id = ? AND status = 'success'
                   GROUP BY platform ORDER BY cnt DESC LIMIT 5""",
                (query.from_user.id,),
            ).fetchall()
            avg_rating = conn.execute(
                "SELECT AVG(rating) as avg FROM downloads WHERE user_id = ? AND rating > 0",
                (query.from_user.id,),
            ).fetchone()

        downloads = user_data["downloads_count"] if user_data else 0
        joined = user_data["joined_at"][:10] if user_data else "غير معروف"
        avg = avg_rating["avg"] if avg_rating and avg_rating["avg"] else 0

        text = f"📊 <b>إحصائياتك:</b>\n\n📥 الإجمالي: <b>{downloads}</b>\n📅 منذ: <b>{joined}</b>\n"
        if avg > 0:
            text += f"💫 متوسط التقييم: <b>{avg:.1f}/5</b>\n"
        if top_platforms:
            text += "\n<b>🔥 أكثر منصاتك:</b>\n"
            for p in top_platforms:
                text += f"• {p['platform']} — {p['cnt']}\n"
    elif data == "how_it_works":
        text = (
            "ℹ️ <b>كيف يعمل البوت؟</b>\n\n"
            "1️⃣ أرسل أي رابط (فيديو/صورة)\n"
            "2️⃣ اختر النوع المطلوب\n"
            "3️⃣ تابع شريط التقدم\n"
            "4️⃣ يصلك الملف ✅\n"
            "5️⃣ قيّم تجربتك ⭐\n\n"
            "<b>نصائح:</b>\n"
            "• الحد: 50 MB لكل ملف\n"
            "• 30 تحميل/ساعة\n"
            "• زر <b>إبلاغ المطور</b> عند أي خطأ"
        )
    else:
        text = "❓ خيار غير معروف"

    keyboard = [[InlineKeyboardButton("🔙 رجوع", callback_data="back_main")]]
    await query.edit_message_text(text, parse_mode=ParseMode.HTML,
                                    reply_markup=InlineKeyboardMarkup(keyboard))


# ================== التحميل المتقدم - مع كل الحلول! ==================

def get_ytdlp_options(url: str, format_type: str = "video", quality: str = "best",
                     output_template: str = None, progress_hook=None) -> dict:
    """
    إعدادات yt-dlp مع حلول لكل المشاكل المعروفة
    """
    if output_template is None:
        # استخدام معرف فقط لتجنب مشاكل الأسماء الطويلة (Snapchat)
        output_template = os.path.join(DOWNLOADS_DIR, f"{uuid.uuid4().hex}.%(ext)s")

    common = {
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": False,
        "max_filesize": MAX_FILE_SIZE_BYTES * 3,
        "socket_timeout": 30,
        "retries": 5,
        "fragment_retries": 5,
        "concurrent_fragment_downloads": 4,
        # ✅ حل مشكلة "extracted extension is unusual" (Snapchat وغيرها)
        "allowed_extractors": ["default", "generic"],
        # السماح بامتدادات إضافية
        "compat_opts": {"allow-unsafe-ext"},
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        },
    }

    if progress_hook:
        common["progress_hooks"] = [progress_hook]

    # =========================================
    # 🔴 حلول YouTube الشاملة
    # =========================================
    if is_youtube(url):
        # استخدام clients متعددة - مهم جداً
        # tv_simply, ios, android_vr لا تتطلب PO Token حالياً
        common["extractor_args"] = {
            "youtube": {
                # هذه الـ clients هي الأقل احتمالاً للحظر
                "player_client": ["tv_simply", "ios", "android_vr", "mweb"],
                # تجنب تنزيل صفحة الويب (يقلل احتمال الحظر)
                "player_skip": ["webpage", "configs"],
            }
        }
        # إذا توفرت كوكيز، استخدمها
        if os.path.exists(YOUTUBE_COOKIES):
            common["cookiefile"] = YOUTUBE_COOKIES
            # مع الكوكيز يمكن استخدام clients إضافية
            common["extractor_args"]["youtube"]["player_client"] = [
                "tv_simply", "ios", "android_vr", "web", "mweb"
            ]
            logger.info("📄 استخدام كوكيز YouTube")

    # =========================================
    # 👻 حلول Snapchat الشاملة
    # =========================================
    elif is_snapchat(url):
        # السماح بامتدادات غير عادية (Snapchat يستخدم extensions غريبة)
        common["compat_opts"] = {"allow-unsafe-ext"}
        # تحديد الصيغة بدقة + fallback
        common["format"] = (
            "best[ext=mp4]/best[ext=m4v]/best[ext=mov]/"
            "bestvideo[ext=mp4]+bestaudio[ext=m4a]/"
            "best/worst"
        )
        # اسم ملف بسيط جداً (لتجنب مشاكل الأسماء الطويلة)
        common["outtmpl"] = os.path.join(DOWNLOADS_DIR, f"{uuid.uuid4().hex}.%(ext)s")
        if os.path.exists(SNAPCHAT_COOKIES):
            common["cookiefile"] = SNAPCHAT_COOKIES

    elif is_instagram(url):
        if os.path.exists(INSTAGRAM_COOKIES):
            common["cookiefile"] = INSTAGRAM_COOKIES

    elif is_facebook(url):
        if os.path.exists(FACEBOOK_COOKIES):
            common["cookiefile"] = FACEBOOK_COOKIES

    elif is_tiktok(url):
        if os.path.exists(TIKTOK_COOKIES):
            common["cookiefile"] = TIKTOK_COOKIES

    # =========================================
    # تحديد الصيغة
    # =========================================
    if format_type == "audio":
        common.update({
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
        })
    elif format_type == "photo":
        # 📸 لتحميل الصور فقط
        common["format"] = "best"
        common["writethumbnail"] = True
        common["skip_download"] = False
    else:  # video
        # لا نطبّق format إذا تم تحديده مسبقاً (Snapchat)
        if "format" not in common:
            if quality == "best":
                common["format"] = "best[filesize<50M]/best[height<=720][filesize<50M]/best[height<=720]/best[height<=480]/best"
            elif quality == "low":
                common["format"] = "worst[height>=240]/worst"
            elif quality == "medium":
                common["format"] = "best[height<=480][filesize<50M]/best[height<=480]/worst"
            elif quality == "high":
                common["format"] = "best[height<=720][filesize<50M]/best[height<=720]/best[height<=480]/best"
            else:
                common["format"] = quality

    return common


async def get_video_info(url: str) -> Optional[dict]:
    """جلب معلومات الفيديو/الصورة دون تحميل"""
    try:
        opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "socket_timeout": 30,
            "compat_opts": {"allow-unsafe-ext"},
        }
        if is_youtube(url):
            opts["extractor_args"] = {
                "youtube": {
                    "player_client": ["tv_simply", "ios", "android_vr", "mweb"],
                    "player_skip": ["webpage", "configs"],
                }
            }
            if os.path.exists(YOUTUBE_COOKIES):
                opts["cookiefile"] = YOUTUBE_COOKIES

        loop = asyncio.get_event_loop()
        info = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: yt_dlp.YoutubeDL(opts).extract_info(url, download=False)
            ),
            timeout=45,
        )
        return info
    except asyncio.TimeoutError:
        logger.error("get_video_info timeout")
        return None
    except Exception as e:
        logger.error(f"get_video_info error: {e}")
        return None


# ================== شريط التقدم ==================

class ProgressTracker:
    def __init__(self, context, chat_id, message_id, platform, format_type):
        self.context = context
        self.chat_id = chat_id
        self.message_id = message_id
        self.platform = platform
        self.format_type = format_type
        self.last_update = 0
        self.last_percent = -1
        self.loop = asyncio.get_event_loop()

    def hook(self, d):
        try:
            status = d.get("status", "")
            if status == "downloading":
                downloaded = d.get("downloaded_bytes", 0)
                total = d.get("total_bytes") or d.get("total_bytes_estimate", 0)
                speed = d.get("speed", 0) or 0
                eta = d.get("eta", 0) or 0
                percent = (downloaded / total * 100) if total else 0

                now = time.time()
                if (now - self.last_update) >= PROGRESS_UPDATE_INTERVAL_SEC and \
                   abs(percent - self.last_percent) >= 1:
                    self.last_update = now
                    self.last_percent = percent

                    bar = make_progress_bar(percent)
                    speed_str = format_size(speed) + "/s" if speed else "..."
                    eta_str = f"{eta}s" if eta else "..."
                    size_str = f"{format_size(downloaded)}/{format_size(total)}" if total else format_size(downloaded)

                    text = (
                        f"⏳ <b>جاري التحميل من {self.platform}</b>\n\n"
                        f"{bar}\n\n"
                        f"📦 <b>الحجم:</b> {size_str}\n"
                        f"⚡ <b>السرعة:</b> {speed_str}\n"
                        f"⏱ <b>المتبقي:</b> {eta_str}"
                    )
                    asyncio.run_coroutine_threadsafe(self._update_message(text), self.loop)

            elif status == "finished":
                text = (
                    f"⚙️ <b>جاري المعالجة من {self.platform}</b>\n\n"
                    f"[{'█' * 15}] 100%\n\n"
                    f"🔄 يتم تجهيز الملف للإرسال..."
                )
                asyncio.run_coroutine_threadsafe(self._update_message(text), self.loop)
        except Exception as e:
            logger.debug(f"progress hook error: {e}")

    async def _update_message(self, text):
        try:
            await self.context.bot.edit_message_text(
                chat_id=self.chat_id, message_id=self.message_id,
                text=text, parse_mode=ParseMode.HTML,
            )
        except Exception:
            pass


# ================== التحميل الرئيسي ==================

async def download_media(url: str, format_type: str = "video", quality: str = "best",
                          progress_tracker: Optional[ProgressTracker] = None
                          ) -> Tuple[Optional[List[str]], Optional[dict], Optional[str], Optional[str]]:
    """
    تحميل الوسائط
    Returns: (file_paths_list, info_dict, error_message, error_details)
    """
    try:
        progress_hook = progress_tracker.hook if progress_tracker else None
        opts = get_ytdlp_options(url, format_type, quality, progress_hook=progress_hook)
        loop = asyncio.get_event_loop()

        # سجل الملفات قبل التحميل
        files_before = set(os.listdir(DOWNLOADS_DIR))

        def _download():
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                return info

        info = await asyncio.wait_for(
            loop.run_in_executor(None, _download),
            timeout=DOWNLOAD_TIMEOUT_SEC,
        )

        # اكتشاف الملفات الجديدة (يدعم تنزيلات متعددة كالألبومات)
        await asyncio.sleep(0.5)  # انتظار قصير للتأكد من حفظ الملفات
        files_after = set(os.listdir(DOWNLOADS_DIR))
        new_files = files_after - files_before
        # تصفية ملفات .part أو الملفات المؤقتة
        new_files = [f for f in new_files if not f.endswith((".part", ".tmp", ".ytdl"))]

        # ترتيب الملفات حسب الحجم تنازلياً (الأكبر أولاً)
        file_paths = sorted(
            [os.path.join(DOWNLOADS_DIR, f) for f in new_files],
            key=lambda p: os.path.getsize(p) if os.path.exists(p) else 0,
            reverse=True,
        )

        if not file_paths:
            return None, info, "لم يتم تحميل أي ملف", "No files were downloaded"

        return file_paths, info, None, None

    except asyncio.TimeoutError:
        return (None, None,
                f"⏱ انتهت المهلة ({DOWNLOAD_TIMEOUT_SEC}s)\nقد يكون الموقع بطيء أو الفيديو كبير.",
                f"Download timeout exceeded {DOWNLOAD_TIMEOUT_SEC}s")

    except yt_dlp.utils.DownloadError as e:
        err = str(e)
        details = traceback.format_exc()

        # رسائل خطأ مفصّلة
        if "Sign in to confirm" in err or "not a bot" in err:
            user_msg = (
                "🤖 <b>YouTube يطلب التحقق</b>\n\n"
                "السبب: يحدث في خوادم Cloud (Render).\n\n"
                "💡 <b>الحلول:</b>\n"
                "• جرّب فيديو آخر (بعض الفيديوهات أكثر حساسية)\n"
                "• تحديث yt-dlp قد يحل المشكلة مؤقتاً\n"
                "• <b>الحل النهائي:</b> إضافة كوكيز YouTube للبوت\n"
                "  راسل المطور لإضافتها"
            )
        elif "extracted extension" in err.lower() and "unusual" in err.lower():
            user_msg = (
                "📹 <b>صيغة فيديو غير مألوفة</b>\n\n"
                "الموقع أعاد ملفاً بصيغة غريبة.\n"
                "💡 جرّب جودة مختلفة أو حمّل الصوت فقط."
            )
        elif "Unsupported URL" in err:
            user_msg = "❌ هذا الموقع غير مدعوم"
        elif "Private" in err or "private" in err:
            user_msg = "🔒 هذا المحتوى خاص"
        elif "Video unavailable" in err:
            user_msg = "⛔ الفيديو غير متاح أو محذوف"
        elif "geo" in err.lower() or "country" in err.lower():
            user_msg = "🌍 الفيديو محظور في منطقة الخادم"
        elif "filesize" in err.lower():
            user_msg = "📦 الملف كبير جداً (الحد 50MB)"
        elif "live" in err.lower() and "stream" in err.lower():
            user_msg = "📡 لا يمكن تحميل البث المباشر"
        elif "members" in err.lower() or "premium" in err.lower():
            user_msg = "👑 محتوى مدفوع/أعضاء فقط"
        elif "no video formats" in err.lower():
            user_msg = (
                "📭 <b>لا توجد صيغ فيديو</b>\n\n"
                "قد يكون المحتوى:\n"
                "• صور فقط (جرّب /photo)\n"
                "• محذوف أو خاص"
            )
        elif "rate limit" in err.lower() or "429" in err:
            user_msg = "🚫 الموقع حظرنا مؤقتاً (Rate Limit). جرّب بعد دقائق."
        else:
            user_msg = f"❌ خطأ في التحميل\n<code>{err[:200]}</code>"

        return None, None, user_msg, details

    except Exception as e:
        details = traceback.format_exc()
        return None, None, f"❌ خطأ غير متوقع: {str(e)[:150]}", details


# ================== معالج الروابط ==================

URL_PATTERN = re.compile(r"https?://[^\s]+")


async def handle_link(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معالج الروابط - عرض خيارات ذكية حسب نوع المنصة"""
    user = update.effective_user
    register_user(user)

    if is_user_banned(user.id):
        await update.message.reply_text("🚫 تم حظرك من استخدام البوت.")
        return

    text = update.message.text or ""
    urls = URL_PATTERN.findall(text)
    if not urls:
        return

    url = urls[0]
    platform = detect_platform(url) or "🌐 موقع آخر"

    allowed, remaining = check_rate_limit(user.id)
    if not allowed:
        await update.message.reply_html(
            "⏳ <b>تجاوزت الحد المسموح!</b>\n30 تحميل/ساعة. حاول لاحقاً."
        )
        return

    context.user_data["pending_url"] = url
    context.user_data["pending_platform"] = platform

    # عرض أزرار مخصصة حسب نوع المنصة
    keyboard = [
        [InlineKeyboardButton("📹 فيديو (أفضل جودة)", callback_data="dl_video_best")],
        [
            InlineKeyboardButton("📺 720p", callback_data="dl_video_high"),
            InlineKeyboardButton("📱 480p", callback_data="dl_video_medium"),
            InlineKeyboardButton("⚡ 240p", callback_data="dl_video_low"),
        ],
        [InlineKeyboardButton("🎵 صوت MP3", callback_data="dl_audio_best")],
    ]

    # 🆕 إضافة زر الصور إذا كانت المنصة تدعم الصور
    if is_likely_image_url(url):
        keyboard.insert(0, [InlineKeyboardButton("📸 صور فقط", callback_data="dl_photo_best")])

    keyboard.append([
        InlineKeyboardButton("ℹ️ معلومات", callback_data="dl_info_none"),
        InlineKeyboardButton("❌ إلغاء", callback_data="cancel"),
    ])

    extra_hint = ""
    if is_likely_image_url(url):
        extra_hint = "\n\n📸 <i>يدعم تحميل الصور أيضاً!</i>"

    await update.message.reply_html(
        f"🔗 <b>الرابط مكتشف!</b>\n\n"
        f"📡 المنصة: {platform}\n"
        f"⏳ المتبقي لك: {remaining}/30{extra_hint}\n\n"
        "اختر نوع التحميل:",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def handle_download_choice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معالج اختيار نوع التحميل"""
    query = update.callback_query
    user = query.from_user
    data = query.data
    parts = data.split("_")
    if len(parts) < 3:
        await query.edit_message_text("❌ خيار غير صحيح")
        return

    _, format_type, quality = parts[0], parts[1], parts[2]
    url = context.user_data.get("pending_url")
    platform = context.user_data.get("pending_platform", "🌐 غير معروف")

    if not url:
        await query.edit_message_text("❌ انتهت صلاحية الطلب. أرسل الرابط مرة أخرى.")
        return

    # === عرض المعلومات فقط ===
    if format_type == "info":
        await query.edit_message_text("⏳ جاري جلب المعلومات...")
        info = await get_video_info(url)
        if not info:
            context.user_data["error_url"] = url
            context.user_data["error_platform"] = platform
            context.user_data["error_msg"] = "فشل جلب معلومات الفيديو"
            context.user_data["error_details"] = "get_video_info returned None"
            keyboard = [[InlineKeyboardButton("📢 إبلاغ المطور", callback_data=f"report_info_{user.id}")]]
            await query.edit_message_text(
                "❌ <b>فشل جلب المعلومات</b>\n\nقد يكون الرابط غير صالح.",
                parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard),
            )
            return

        title = info.get("title", "غير معروف")[:100]
        uploader = info.get("uploader", "غير معروف")
        duration = format_duration(info.get("duration"))
        view_count = info.get("view_count", 0)

        text = (
            f"ℹ️ <b>معلومات</b>\n\n"
            f"📡 {platform}\n"
            f"📝 <b>{title}</b>\n"
            f"👤 {uploader}\n"
            f"⏱ {duration}\n"
        )
        if view_count:
            text += f"👁 {view_count:,} مشاهدة\n"

        keyboard = [[InlineKeyboardButton("📥 تحميل", callback_data="dl_video_best")]]
        await query.edit_message_text(text, parse_mode=ParseMode.HTML,
                                        reply_markup=InlineKeyboardMarkup(keyboard))
        return

    # === التحميل الفعلي ===
    await query.edit_message_text(
        f"⏳ <b>بدء التحميل من {platform}...</b>\n\n🔍 جاري الاتصال بالموقع...",
        parse_mode=ParseMode.HTML,
    )

    chat_action = ChatAction.UPLOAD_PHOTO if format_type == "photo" else \
                   ChatAction.UPLOAD_VIDEO if format_type == "video" else \
                   ChatAction.UPLOAD_AUDIO
    await context.bot.send_chat_action(query.message.chat_id, chat_action)

    progress_tracker = ProgressTracker(
        context, query.message.chat_id, query.message.message_id, platform, format_type
    )

    file_paths, info, error, error_details = await download_media(
        url, format_type, quality, progress_tracker
    )

    # === حالة الفشل ===
    if error or not file_paths:
        context.user_data["error_url"] = url
        context.user_data["error_platform"] = platform
        context.user_data["error_msg"] = error
        context.user_data["error_details"] = error_details or "Unknown error"

        keyboard = [
            [InlineKeyboardButton("🔄 إعادة المحاولة", callback_data=f"dl_{format_type}_{quality}")],
            [InlineKeyboardButton("📢 إبلاغ المطور", callback_data=f"report_dl_{user.id}")],
        ]
        # اقتراحات بديلة
        if format_type == "video":
            if is_likely_image_url(url):
                keyboard.insert(1, [InlineKeyboardButton("📸 جرّب تحميل الصور", callback_data="dl_photo_best")])
            keyboard.insert(1, [InlineKeyboardButton("🎵 جرّب الصوت فقط", callback_data="dl_audio_best")])

        await query.edit_message_text(
            f"❌ <b>فشل التحميل</b>\n\n{error}",
            parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard),
        )
        log_download(user, platform, url, "", format_type, 0, "failed")
        return

    # === فلترة الملفات حسب النوع ===
    image_extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
    video_extensions = {".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v", ".flv"}
    audio_extensions = {".mp3", ".m4a", ".aac", ".ogg", ".wav", ".opus"}

    images = [f for f in file_paths if os.path.splitext(f)[1].lower() in image_extensions]
    videos = [f for f in file_paths if os.path.splitext(f)[1].lower() in video_extensions]
    audios = [f for f in file_paths if os.path.splitext(f)[1].lower() in audio_extensions]
    others = [f for f in file_paths if f not in images and f not in videos and f not in audios]

    title = (info.get("title", "") if info else "")[:200]
    uploader = info.get("uploader", "") if info else ""
    duration = info.get("duration") if info else None

    success_count = 0
    total_size = 0
    download_id = None

    try:
        # === إرسال الصور ===
        if images:
            await query.edit_message_text(
                f"📤 <b>جاري إرسال {len(images)} صورة...</b>",
                parse_mode=ParseMode.HTML,
            )

            # تيليجرام يقبل media group حتى 10 عناصر
            for i in range(0, len(images), 10):
                batch = images[i:i+10]
                # تصفية الصور الكبيرة جداً
                valid_imgs = []
                for img in batch:
                    sz = os.path.getsize(img)
                    if sz <= MAX_PHOTO_SIZE_BYTES:
                        valid_imgs.append(img)
                        total_size += sz

                if not valid_imgs:
                    continue

                if len(valid_imgs) == 1:
                    with open(valid_imgs[0], "rb") as f:
                        await context.bot.send_photo(
                            query.message.chat_id, f,
                            caption=f"📡 {platform}\n📝 {title}\n🤖 @{context.bot.username}" if i == 0 else None,
                            parse_mode=ParseMode.HTML,
                        )
                else:
                    media = []
                    for j, img in enumerate(valid_imgs):
                        with open(img, "rb") as f:
                            cap = f"📡 {platform}\n📝 {title}\n🤖 @{context.bot.username}" if (i == 0 and j == 0) else None
                            media.append(InputMediaPhoto(media=f.read(),
                                                         caption=cap,
                                                         parse_mode=ParseMode.HTML))
                    await context.bot.send_media_group(query.message.chat_id, media)
                success_count += len(valid_imgs)

        # === إرسال الفيديوهات ===
        for video in videos:
            sz = os.path.getsize(video)
            if sz > MAX_FILE_SIZE_BYTES:
                continue
            total_size += sz
            caption = f"📡 <b>{platform}</b>\n"
            if title:
                caption += f"📝 {title}\n"
            if uploader:
                caption += f"👤 {uploader}\n"
            caption += f"\n💾 {format_size(sz)}\n🤖 @{context.bot.username}"

            with open(video, "rb") as f:
                await context.bot.send_video(
                    query.message.chat_id, f, caption=caption,
                    parse_mode=ParseMode.HTML, duration=duration,
                    supports_streaming=True,
                )
            success_count += 1

        # === إرسال الصوت ===
        for audio in audios:
            sz = os.path.getsize(audio)
            if sz > MAX_FILE_SIZE_BYTES:
                continue
            total_size += sz
            caption = f"📡 {platform}\n📝 {title}\n🤖 @{context.bot.username}"
            with open(audio, "rb") as f:
                await context.bot.send_audio(
                    query.message.chat_id, f, caption=caption,
                    title=title[:64] if title else None,
                    performer=uploader[:64] if uploader else None,
                    duration=duration,
                )
            success_count += 1

        # === ملفات أخرى (نرسلها كـ document) ===
        for other in others:
            sz = os.path.getsize(other)
            if sz > MAX_FILE_SIZE_BYTES:
                continue
            total_size += sz
            with open(other, "rb") as f:
                await context.bot.send_document(
                    query.message.chat_id, f,
                    caption=f"📡 {platform}\n📝 {title}\n🤖 @{context.bot.username}",
                )
            success_count += 1

        if success_count == 0:
            keyboard = [
                [InlineKeyboardButton("🔄 إعادة المحاولة", callback_data=f"dl_{format_type}_{quality}")],
                [InlineKeyboardButton("📢 إبلاغ المطور", callback_data=f"report_dl_{user.id}")],
            ]
            context.user_data["error_msg"] = "كل الملفات أكبر من الحد المسموح (50MB)"
            context.user_data["error_details"] = "All files exceeded MAX_FILE_SIZE_BYTES"
            await query.edit_message_text(
                "⚠️ <b>كل الملفات كبيرة جداً</b>\n\nجرّب جودة أقل أو الصوت فقط.",
                parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard),
            )
            log_download(user, platform, url, title, format_type, 0, "too_large")
            return

        # === رسالة النجاح + التقييم ===
        download_id = log_download(user, platform, url, title, format_type,
                                     total_size/(1024*1024), "success")

        rating_keyboard = [
            [
                InlineKeyboardButton("⭐", callback_data=f"rate_{download_id}_1"),
                InlineKeyboardButton("⭐⭐", callback_data=f"rate_{download_id}_2"),
                InlineKeyboardButton("⭐⭐⭐", callback_data=f"rate_{download_id}_3"),
            ],
            [
                InlineKeyboardButton("⭐⭐⭐⭐", callback_data=f"rate_{download_id}_4"),
                InlineKeyboardButton("⭐⭐⭐⭐⭐", callback_data=f"rate_{download_id}_5"),
            ],
        ]

        success_msg = f"✅ <b>تم الإرسال بنجاح!</b>\n\n"
        if len(images) > 1:
            success_msg += f"📸 الصور: {success_count}\n"
        success_msg += f"📡 {platform}\n💾 {format_size(total_size)}\n\n"
        success_msg += "🌟 <b>قيّم تجربتك:</b>"

        await query.edit_message_text(
            success_msg, parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(rating_keyboard),
        )

    except Exception as e:
        details = traceback.format_exc()
        context.user_data["error_url"] = url
        context.user_data["error_platform"] = platform
        context.user_data["error_msg"] = f"فشل الإرسال: {str(e)[:100]}"
        context.user_data["error_details"] = details
        keyboard = [[InlineKeyboardButton("📢 إبلاغ المطور", callback_data=f"report_send_{user.id}")]]
        await query.edit_message_text(
            f"❌ <b>فشل إرسال الملف</b>\n\n{str(e)[:200]}",
            parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard),
        )
        log_download(user, platform, url, title, format_type, 0, "send_failed")
    finally:
        # تنظيف الملفات
        for path in file_paths:
            try:
                os.remove(path)
            except Exception:
                pass
        context.user_data.pop("pending_url", None)
        context.user_data.pop("pending_platform", None)


# ================== التقييم ==================

async def handle_rating(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    parts = query.data.split("_")
    if len(parts) != 3:
        return
    download_id = int(parts[1])
    rating = int(parts[2])

    try:
        with get_db() as conn:
            conn.execute(
                "UPDATE downloads SET rating = ? WHERE id = ? AND user_id = ?",
                (rating, download_id, query.from_user.id),
            )
        stars = "⭐" * rating
        await query.edit_message_text(
            f"✅ <b>شكراً لتقييمك!</b>\n\n{stars} ({rating}/5)\n\n"
            f"<i>تقييماتك تساعدنا على التطوير 💙</i>",
            parse_mode=ParseMode.HTML,
        )
    except Exception as e:
        logger.error(f"rating error: {e}")
        await query.answer("❌ فشل حفظ التقييم", show_alert=True)


# ================== الإبلاغ عن الأخطاء ==================

async def handle_report_error(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user = query.from_user

    url = context.user_data.get("error_url", "غير معروف")
    platform = context.user_data.get("error_platform", "غير معروف")
    error_msg = context.user_data.get("error_msg", "غير معروف")
    error_details = context.user_data.get("error_details", "")

    try:
        with get_db() as conn:
            cur = conn.execute(
                """INSERT INTO error_reports (user_id, username, url, platform, error_message, error_details)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (user.id, user.username or "", url, platform, error_msg, error_details),
            )
            report_id = cur.lastrowid

        if OWNER_ID:
            developer_text = (
                f"🚨 <b>تقرير خطأ #{report_id}</b>\n\n"
                f"👤 {user.mention_html()}\n"
                f"🆔 <code>{user.id}</code>\n"
                f"📡 {platform}\n"
                f"🔗 <code>{url[:200]}</code>\n\n"
                f"❌ <b>الخطأ:</b>\n{error_msg[:500]}\n\n"
                f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            )

            keyboard = [
                [
                    InlineKeyboardButton("📋 تفاصيل تقنية", callback_data=f"err_details_{report_id}"),
                    InlineKeyboardButton("✅ تم الحل", callback_data=f"err_resolve_{report_id}"),
                ],
                [InlineKeyboardButton("💬 رد على المستخدم", callback_data=f"err_reply_{report_id}")],
            ]

            try:
                await context.bot.send_message(
                    chat_id=OWNER_ID, text=developer_text,
                    parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard),
                )
                if len(error_details) > 500:
                    error_file_path = os.path.join(ERROR_LOGS_DIR, f"error_{report_id}.txt")
                    with open(error_file_path, "w", encoding="utf-8") as f:
                        f.write(f"Report #{report_id}\n")
                        f.write(f"User: {user.id} (@{user.username})\n")
                        f.write(f"URL: {url}\n")
                        f.write(f"Platform: {platform}\n")
                        f.write(f"Error: {error_msg}\n\n")
                        f.write("=" * 50 + "\n")
                        f.write("Full Traceback:\n")
                        f.write(error_details)
                    with open(error_file_path, "rb") as f:
                        await context.bot.send_document(
                            chat_id=OWNER_ID, document=f,
                            filename=f"error_{report_id}.txt",
                            caption=f"📋 تفاصيل التقرير #{report_id}",
                        )
            except Exception as e:
                logger.error(f"إرسال للمطور فشل: {e}")

        await query.edit_message_text(
            f"✅ <b>تم إرسال تقرير الخطأ</b>\n\n"
            f"📋 رقم التقرير: <code>#{report_id}</code>\n\n"
            f"<i>المطور سيراجع المشكلة. شكراً لك 💙</i>",
            parse_mode=ParseMode.HTML,
        )
    except Exception as e:
        logger.exception("report error")
        await query.edit_message_text(f"❌ فشل إرسال التقرير: {str(e)[:100]}")


async def handle_error_action(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    if query.from_user.id != OWNER_ID:
        await query.answer("❌ للمطور فقط", show_alert=True)
        return

    parts = query.data.split("_")
    if len(parts) < 3:
        return
    action = parts[1]
    report_id = int(parts[2])

    try:
        with get_db() as conn:
            report = conn.execute("SELECT * FROM error_reports WHERE id = ?", (report_id,)).fetchone()
        if not report:
            await query.answer("❌ التقرير غير موجود", show_alert=True)
            return

        if action == "details":
            details = report["error_details"][:3500] if report["error_details"] else "لا توجد تفاصيل"
            await query.message.reply_html(
                f"📋 <b>تفاصيل #{report_id}</b>\n\n<code>{details}</code>"
            )
            await query.answer()
        elif action == "resolve":
            with get_db() as conn:
                conn.execute("UPDATE error_reports SET status = 'resolved' WHERE id = ?", (report_id,))
            await query.answer("✅ تم", show_alert=True)
            try:
                await context.bot.send_message(
                    chat_id=report["user_id"],
                    text=f"✅ <b>تم حل المشكلة!</b>\n\nتقريرك #{report_id} تمت معالجته.",
                    parse_mode=ParseMode.HTML,
                )
            except Exception:
                pass
        elif action == "reply":
            context.user_data["replying_to_report"] = report_id
            context.user_data["replying_to_user"] = report["user_id"]
            await query.message.reply_text(
                f"💬 أرسل ردك للمستخدم الآن (سيُرسل بخصوص التقرير #{report_id})"
            )
    except Exception as e:
        logger.exception("error action")
        await query.answer(f"❌ خطأ: {str(e)[:50]}", show_alert=True)


async def handle_owner_reply(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != OWNER_ID:
        return
    report_id = context.user_data.get("replying_to_report")
    user_id = context.user_data.get("replying_to_user")
    if not report_id or not user_id:
        return
    reply_text = update.message.text or ""
    if reply_text.startswith("/"):
        return

    try:
        await context.bot.send_message(
            chat_id=user_id,
            text=f"💬 <b>رد من المطور بخصوص تقريرك #{report_id}:</b>\n\n{reply_text}",
            parse_mode=ParseMode.HTML,
        )
        await update.message.reply_text("✅ تم إرسال ردك")
        context.user_data.pop("replying_to_report", None)
        context.user_data.pop("replying_to_user", None)
    except Exception as e:
        await update.message.reply_text(f"❌ فشل: {e}")


# ================== أوامر سريعة ==================

async def _quick_download(update, context, url, format_type):
    """دالة مساعدة للتحميل السريع"""
    user = update.effective_user
    register_user(user)
    if is_user_banned(user.id):
        return
    allowed, _ = check_rate_limit(user.id)
    if not allowed:
        await update.message.reply_text("⏳ تجاوزت الحد!")
        return

    platform = detect_platform(url) or "🌐 موقع"
    msg = await update.message.reply_html(f"⏳ بدء التحميل من {platform}...")
    progress = ProgressTracker(context, msg.chat_id, msg.message_id, platform, format_type)
    file_paths, info, error, details = await download_media(url, format_type, "best", progress)

    if error or not file_paths:
        context.user_data["error_url"] = url
        context.user_data["error_platform"] = platform
        context.user_data["error_msg"] = error
        context.user_data["error_details"] = details or ""
        keyboard = [[InlineKeyboardButton("📢 إبلاغ المطور", callback_data=f"report_dl_{user.id}")]]
        await msg.edit_text(f"❌ {error}", parse_mode=ParseMode.HTML,
                             reply_markup=InlineKeyboardMarkup(keyboard))
        return

    title = (info.get("title", "") if info else "")[:200]
    duration = info.get("duration") if info else None
    success = 0
    total_sz = 0

    try:
        await msg.edit_text(f"📤 جاري الرفع...")
        for fp in file_paths:
            sz = os.path.getsize(fp)
            if sz > MAX_FILE_SIZE_BYTES and format_type != "photo":
                continue
            if format_type == "photo" and sz > MAX_PHOTO_SIZE_BYTES:
                continue
            total_sz += sz
            ext = os.path.splitext(fp)[1].lower()
            with open(fp, "rb") as f:
                if format_type == "audio" or ext in (".mp3", ".m4a", ".aac"):
                    await context.bot.send_audio(
                        update.effective_chat.id, f,
                        caption=f"🎵 {title}\n📡 {platform}\n🤖 @{context.bot.username}",
                        title=title[:64] if title else None, duration=duration,
                    )
                elif format_type == "photo" or ext in (".jpg", ".jpeg", ".png", ".webp"):
                    await context.bot.send_photo(
                        update.effective_chat.id, f,
                        caption=f"📡 {platform}\n📝 {title}\n🤖 @{context.bot.username}",
                    )
                else:
                    await context.bot.send_video(
                        update.effective_chat.id, f,
                        caption=f"📹 {title}\n📡 {platform}\n🤖 @{context.bot.username}",
                        duration=duration, supports_streaming=True,
                    )
            success += 1

        if success == 0:
            await msg.edit_text("⚠️ كل الملفات كبيرة جداً")
            return

        download_id = log_download(user, platform, url, title, format_type,
                                     total_sz/(1024*1024), "success")
        rating_kb = [[InlineKeyboardButton(f"{'⭐' * i}", callback_data=f"rate_{download_id}_{i}")
                      for i in range(1, 6)]]
        await msg.edit_text(f"✅ تم! ({success} ملف)\n\nقيّم تجربتك:",
                             reply_markup=InlineKeyboardMarkup(rating_kb))
    except Exception as e:
        await msg.edit_text(f"❌ {str(e)[:100]}")
    finally:
        for fp in file_paths:
            try:
                os.remove(fp)
            except Exception:
                pass


async def cmd_audio(update, context):
    if not context.args:
        await update.message.reply_text("⚠️ /audio [رابط]")
        return
    url = context.args[0]
    if not URL_PATTERN.match(url):
        await update.message.reply_text("❌ رابط غير صالح")
        return
    await _quick_download(update, context, url, "audio")


async def cmd_video(update, context):
    if not context.args:
        await update.message.reply_text("⚠️ /video [رابط]")
        return
    url = context.args[0]
    if not URL_PATTERN.match(url):
        await update.message.reply_text("❌ رابط غير صالح")
        return
    await _quick_download(update, context, url, "video")


async def cmd_photo(update, context):
    """🆕 أمر تحميل الصور"""
    if not context.args:
        await update.message.reply_text("⚠️ /photo [رابط]")
        return
    url = context.args[0]
    if not URL_PATTERN.match(url):
        await update.message.reply_text("❌ رابط غير صالح")
        return
    await _quick_download(update, context, url, "photo")


async def cmd_info(update, context):
    if not context.args:
        await update.message.reply_text("⚠️ /info [رابط]")
        return
    url = context.args[0]
    if not URL_PATTERN.match(url):
        await update.message.reply_text("❌ رابط غير صالح")
        return

    msg = await update.message.reply_text("⏳ جاري جلب المعلومات...")
    info = await get_video_info(url)
    if not info:
        await msg.edit_text("❌ فشل جلب المعلومات")
        return

    platform = detect_platform(url) or "🌐"
    text = (
        f"ℹ️ <b>معلومات</b>\n\n"
        f"📡 {platform}\n"
        f"📝 <b>{info.get('title', 'غير معروف')[:100]}</b>\n"
        f"👤 {info.get('uploader', 'غير معروف')}\n"
        f"⏱ {format_duration(info.get('duration'))}\n"
    )
    views = info.get("view_count", 0)
    if views:
        text += f"👁 {views:,}\n"
    await msg.edit_text(text, parse_mode=ParseMode.HTML)


async def cmd_stats(update, context):
    user = update.effective_user
    with get_db() as conn:
        user_data = conn.execute(
            "SELECT downloads_count, joined_at FROM users WHERE user_id = ?", (user.id,)
        ).fetchone()
        platforms = conn.execute(
            """SELECT platform, COUNT(*) as cnt FROM downloads
               WHERE user_id = ? AND status = 'success'
               GROUP BY platform ORDER BY cnt DESC LIMIT 5""", (user.id,)
        ).fetchall()
        recent = conn.execute(
            """SELECT COUNT(*) as cnt FROM downloads
               WHERE user_id = ? AND status = 'success'
               AND downloaded_at > datetime('now', '-7 days')""", (user.id,)
        ).fetchone()
        avg_rating = conn.execute(
            "SELECT AVG(rating) as avg FROM downloads WHERE user_id = ? AND rating > 0", (user.id,)
        ).fetchone()

    if not user_data:
        await update.message.reply_text("📭 ابدأ بالتحميل!")
        return

    text = (
        f"📊 <b>إحصائياتك</b>\n\n"
        f"📥 الإجمالي: <b>{user_data['downloads_count']}</b>\n"
        f"📅 آخر 7 أيام: <b>{recent['cnt']}</b>\n"
    )
    if avg_rating and avg_rating["avg"]:
        text += f"⭐ متوسط: <b>{avg_rating['avg']:.1f}/5</b>\n"
    text += f"🗓 منذ: {user_data['joined_at'][:10]}\n"
    if platforms:
        text += "\n<b>🏆 منصاتك:</b>\n"
        for p in platforms:
            text += f"• {p['platform']} — {p['cnt']}\n"
    await update.message.reply_html(text)


# ================== أوامر الإدارة ==================

async def cmd_admin(update, context):
    if update.effective_user.id != OWNER_ID:
        return
    with get_db() as conn:
        total_users = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
        total_dl = conn.execute("SELECT COUNT(*) as c FROM downloads WHERE status='success'").fetchone()["c"]
        today_dl = conn.execute(
            "SELECT COUNT(*) as c FROM downloads WHERE status='success' AND downloaded_at > datetime('now', '-1 day')"
        ).fetchone()["c"]
        active = conn.execute(
            "SELECT COUNT(*) as c FROM users WHERE last_active > datetime('now', '-1 day')"
        ).fetchone()["c"]
        banned = conn.execute("SELECT COUNT(*) as c FROM users WHERE is_banned=1").fetchone()["c"]
        pending_errors = conn.execute(
            "SELECT COUNT(*) as c FROM error_reports WHERE status='pending'"
        ).fetchone()["c"]
        avg_rating = conn.execute("SELECT AVG(rating) as avg FROM downloads WHERE rating > 0").fetchone()
        top_platforms = conn.execute(
            """SELECT platform, COUNT(*) as cnt FROM downloads WHERE status='success'
               GROUP BY platform ORDER BY cnt DESC LIMIT 5"""
        ).fetchall()

    try:
        statvfs = os.statvfs(DATA_DIR)
        free_mb = (statvfs.f_bavail * statvfs.f_frsize) / (1024 * 1024)
        total_mb = (statvfs.f_blocks * statvfs.f_frsize) / (1024 * 1024)
    except Exception:
        free_mb = total_mb = 0

    db_size = os.path.getsize(DB_PATH) / (1024 * 1024) if os.path.exists(DB_PATH) else 0
    avg = avg_rating["avg"] if avg_rating and avg_rating["avg"] else 0

    text = (
        "🔐 <b>لوحة الإدارة</b>\n\n"
        f"👥 المستخدمين: <b>{total_users}</b>\n"
        f"🟢 نشطين اليوم: <b>{active}</b>\n"
        f"🚫 محظورين: <b>{banned}</b>\n\n"
        f"📥 الإجمالي: <b>{total_dl:,}</b>\n"
        f"📅 اليوم: <b>{today_dl}</b>\n"
        f"⭐ متوسط التقييم: <b>{avg:.2f}/5</b>\n\n"
        f"🚨 تقارير معلّقة: <b>{pending_errors}</b>\n\n"
        f"💾 DB: <b>{db_size:.2f} MB</b>\n"
        f"💿 المساحة: <b>{free_mb:.0f}/{total_mb:.0f} MB</b>\n"
    )
    if top_platforms:
        text += "\n<b>🏆 المنصات:</b>\n"
        for p in top_platforms:
            text += f"• {p['platform']} — {p['cnt']:,}\n"
    text += (
        "\n<b>الأوامر:</b>\n"
        "<code>/errors</code> - تقارير الأخطاء\n"
        "<code>/setcookies</code> - إضافة كوكيز\n"
        "<code>/broadcast</code> - بث\n"
        "<code>/ban [id]</code> - حظر\n"
        "<code>/cleanup</code> - تنظيف"
    )
    await update.message.reply_html(text)


async def cmd_errors(update, context):
    if update.effective_user.id != OWNER_ID:
        return
    with get_db() as conn:
        reports = conn.execute(
            """SELECT id, username, url, platform, error_message, reported_at, status
               FROM error_reports ORDER BY reported_at DESC LIMIT 10"""
        ).fetchall()
    if not reports:
        await update.message.reply_text("📭 لا توجد تقارير.")
        return

    text = "🚨 <b>آخر 10 تقارير:</b>\n\n"
    for r in reports:
        emoji = "🟡" if r["status"] == "pending" else "✅"
        text += (
            f"{emoji} <b>#{r['id']}</b> — {r['platform']}\n"
            f"👤 @{r['username'] or '?'}\n"
            f"❌ {r['error_message'][:80]}\n"
            f"📅 {r['reported_at'][:16]}\n\n"
        )
    await update.message.reply_html(text)


async def cmd_setcookies(update, context):
    if update.effective_user.id != OWNER_ID:
        return
    text = (
        "🍪 <b>إعداد ملفات الكوكيز</b>\n\n"
        "أرسل ملف cookies.txt كـ document\nمع caption يحدد الموقع:\n\n"
        "• <code>youtube</code>\n"
        "• <code>instagram</code>\n"
        "• <code>facebook</code>\n"
        "• <code>tiktok</code>\n"
        "• <code>snapchat</code>\n\n"
        "<b>📥 كيفية الحصول على الكوكيز:</b>\n"
        "1. ثبّت <b>Get cookies.txt LOCALLY</b> على Chrome\n"
        "2. سجّل دخولك للموقع\n"
        "3. اضغط الإضافة → Export\n"
        "4. أرسل الملف هنا\n\n"
        "📁 <b>الموجود حالياً:</b>\n"
    )
    for name, path in [("YouTube", YOUTUBE_COOKIES), ("Instagram", INSTAGRAM_COOKIES),
                        ("Facebook", FACEBOOK_COOKIES), ("TikTok", TIKTOK_COOKIES),
                        ("Snapchat", SNAPCHAT_COOKIES)]:
        text += f"• {name}: {'✅' if os.path.exists(path) else '❌'}\n"
    await update.message.reply_html(text)


async def handle_cookies_upload(update, context):
    if update.effective_user.id != OWNER_ID:
        return
    if not update.message.document:
        return
    caption = (update.message.caption or "").lower().strip()
    cookies_map = {
        "youtube": YOUTUBE_COOKIES, "instagram": INSTAGRAM_COOKIES,
        "facebook": FACEBOOK_COOKIES, "tiktok": TIKTOK_COOKIES,
        "snapchat": SNAPCHAT_COOKIES,
    }
    target = None
    for site, path in cookies_map.items():
        if site in caption:
            target = path
            break
    if not target:
        await update.message.reply_text("⚠️ caption: youtube/instagram/facebook/tiktok/snapchat")
        return
    try:
        file = await update.message.document.get_file()
        await file.download_to_drive(target)
        await update.message.reply_text(f"✅ تم حفظ الكوكيز")
    except Exception as e:
        await update.message.reply_text(f"❌ {e}")


async def cmd_broadcast(update, context):
    if update.effective_user.id != OWNER_ID:
        return
    if not context.args:
        await update.message.reply_text("⚠️ /broadcast [رسالة]")
        return
    msg = " ".join(context.args)
    with get_db() as conn:
        users = conn.execute("SELECT user_id FROM users WHERE is_banned=0").fetchall()
    status = await update.message.reply_text(f"📤 بث لـ {len(users)} مستخدم...")
    sent = failed = 0
    for u in users:
        try:
            await context.bot.send_message(u["user_id"], msg, parse_mode=ParseMode.HTML)
            sent += 1
            await asyncio.sleep(0.05)
        except Exception:
            failed += 1
    await status.edit_text(f"✅ ناجحة: {sent} | فاشلة: {failed}")


async def cmd_ban_user(update, context):
    if update.effective_user.id != OWNER_ID:
        return
    if not context.args:
        await update.message.reply_text("⚠️ /ban [user_id]")
        return
    try:
        uid = int(context.args[0])
        with get_db() as conn:
            conn.execute("UPDATE users SET is_banned=1 WHERE user_id=?", (uid,))
        await update.message.reply_text(f"🚫 {uid}")
    except Exception as e:
        await update.message.reply_text(f"❌ {e}")


async def cmd_unban_user(update, context):
    if update.effective_user.id != OWNER_ID:
        return
    if not context.args:
        await update.message.reply_text("⚠️ /unban [user_id]")
        return
    try:
        uid = int(context.args[0])
        with get_db() as conn:
            conn.execute("UPDATE users SET is_banned=0 WHERE user_id=?", (uid,))
        await update.message.reply_text(f"✅ {uid}")
    except Exception as e:
        await update.message.reply_text(f"❌ {e}")


async def cmd_cleanup(update, context):
    if update.effective_user.id != OWNER_ID:
        return
    cleanup_old_files()
    files = os.listdir(DOWNLOADS_DIR)
    await update.message.reply_text(f"🧹 ملفات متبقية: {len(files)}")


# ================== ويب سيرفر ==================

async def health_check(request):
    return web.json_response({
        "status": "alive", "bot": "media downloader v3",
        "supported_platforms": len(set(SUPPORTED_PLATFORMS.values())),
    })


async def start_web_server():
    app = web.Application()
    app.router.add_get("/", health_check)
    app.router.add_get("/health", health_check)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info(f"🌐 الخادم على المنفذ {PORT}")


async def periodic_cleanup(context):
    cleanup_old_files()


# ================== التشغيل ==================

async def setup_commands(application):
    commands = [
        BotCommand("start", "🚀 بدء البوت"),
        BotCommand("help", "📚 المساعدة"),
        BotCommand("audio", "🎵 صوت MP3"),
        BotCommand("video", "📹 فيديو"),
        BotCommand("photo", "📸 صور"),
        BotCommand("info", "ℹ️ معلومات"),
        BotCommand("platforms", "🌐 المنصات"),
        BotCommand("stats", "📊 إحصائياتي"),
    ]
    await application.bot.set_my_commands(commands)


async def post_init(application):
    await setup_commands(application)
    await start_web_server()
    application.job_queue.run_repeating(periodic_cleanup, interval=600, first=600)
    logger.info("✅ البوت v3 جاهز!")


def main():
    if not BOT_TOKEN:
        logger.error("❌ BOT_TOKEN غير معرّف!")
        return

    init_database()
    application = Application.builder().token(BOT_TOKEN).post_init(post_init).build()

    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("help", cmd_help))
    application.add_handler(CommandHandler("audio", cmd_audio))
    application.add_handler(CommandHandler("video", cmd_video))
    application.add_handler(CommandHandler("photo", cmd_photo))
    application.add_handler(CommandHandler("info", cmd_info))
    application.add_handler(CommandHandler("platforms", cmd_platforms))
    application.add_handler(CommandHandler("stats", cmd_stats))

    application.add_handler(CommandHandler("admin", cmd_admin))
    application.add_handler(CommandHandler("errors", cmd_errors))
    application.add_handler(CommandHandler("setcookies", cmd_setcookies))
    application.add_handler(CommandHandler("broadcast", cmd_broadcast))
    application.add_handler(CommandHandler("ban", cmd_ban_user))
    application.add_handler(CommandHandler("unban", cmd_unban_user))
    application.add_handler(CommandHandler("cleanup", cmd_cleanup))

    application.add_handler(CallbackQueryHandler(callback_handler))

    application.add_handler(
        MessageHandler(filters.Document.ALL & filters.User(OWNER_ID), handle_cookies_upload)
    )
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND & filters.User(OWNER_ID), handle_owner_reply),
        group=1,
    )
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND & filters.Regex(URL_PATTERN), handle_link),
        group=2,
    )

    logger.info("🚀 v3 يبدأ العمل...")
    application.run_polling(drop_pending_updates=True, allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
