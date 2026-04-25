"""
🎬 بوت تحميل الوسائط من جميع مواقع التواصل الاجتماعي
=========================================================
الإصدار: 2.0 - محسّن مع:
  ✅ حلول مشاكل YouTube (player clients متعددة + cookies)
  ✅ شريط تقدم مباشر للتحميل
  ✅ زر "إبلاغ المطور" مع تفاصيل الخطأ
  ✅ تقييم التحميل (⭐ ratings)
  ✅ معالجة timeout أفضل
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

# مسارات ملفات الكوكيز (اختياري - إذا وفّرها المالك يستخدمها للمواقع المعنية)
YOUTUBE_COOKIES = os.path.join(COOKIES_DIR, "youtube.txt")
INSTAGRAM_COOKIES = os.path.join(COOKIES_DIR, "instagram.txt")
FACEBOOK_COOKIES = os.path.join(COOKIES_DIR, "facebook.txt")
TIKTOK_COOKIES = os.path.join(COOKIES_DIR, "tiktok.txt")

MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
TEMP_FILE_LIFETIME_MIN = 10

# مهلة التحميل (3 دقائق - كافية لمعظم الفيديوهات)
DOWNLOAD_TIMEOUT_SEC = 180

# تأخير تحديث شريط التقدم (تيليجرام يحظر التحديثات السريعة جداً)
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


def detect_platform(url: str) -> Optional[str]:
    """كشف المنصة من الرابط"""
    try:
        domain = urlparse(url).netloc.lower().replace("www.", "")
        for key, name in SUPPORTED_PLATFORMS.items():
            if key in domain:
                return name
        return None
    except Exception:
        return None


def is_youtube(url: str) -> bool:
    """تحقق إذا كان رابط YouTube"""
    return any(d in url.lower() for d in ["youtube.com", "youtu.be"])


def is_instagram(url: str) -> bool:
    return "instagram.com" in url.lower()


def is_facebook(url: str) -> bool:
    return any(d in url.lower() for d in ["facebook.com", "fb.watch", "fb.com"])


def is_tiktok(url: str) -> bool:
    return "tiktok.com" in url.lower()


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
    """إنشاء جداول قاعدة البيانات"""
    with get_db() as conn:
        cur = conn.cursor()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS downloads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                username TEXT,
                platform TEXT,
                url TEXT,
                title TEXT,
                file_type TEXT,
                file_size_mb REAL,
                status TEXT,
                rating INTEGER DEFAULT 0,
                downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
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

        # 🆕 جدول التقارير عن الأخطاء
        cur.execute("""
            CREATE TABLE IF NOT EXISTS error_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                username TEXT,
                url TEXT,
                platform TEXT,
                error_message TEXT,
                error_details TEXT,
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
    """تسجيل مستخدم جديد"""
    try:
        with get_db() as conn:
            conn.execute(
                """INSERT INTO users (user_id, username, first_name)
                   VALUES (?, ?, ?)
                   ON CONFLICT(user_id) DO UPDATE SET
                     username = excluded.username,
                     first_name = excluded.first_name,
                     last_active = CURRENT_TIMESTAMP""",
                (user.id, user.username or "", user.first_name or ""),
            )
            conn.execute(
                "INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)",
                (user.id,),
            )
    except Exception as e:
        logger.error(f"register_user error: {e}")


def is_user_banned(user_id: int) -> bool:
    try:
        with get_db() as conn:
            row = conn.execute(
                "SELECT is_banned FROM users WHERE user_id = ?", (user_id,)
            ).fetchone()
            return row and row["is_banned"] == 1
    except Exception:
        return False


def check_rate_limit(user_id: int, max_per_hour: int = 30) -> Tuple[bool, int]:
    """فحص حد الاستخدام"""
    if user_id == OWNER_ID:
        return True, 999

    try:
        with get_db() as conn:
            row = conn.execute(
                "SELECT count, reset_at FROM rate_limits WHERE user_id = ?",
                (user_id,),
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

            conn.execute(
                "UPDATE rate_limits SET count = count + 1 WHERE user_id = ?",
                (user_id,),
            )
            return True, max_per_hour - row["count"] - 1
    except Exception as e:
        logger.error(f"rate_limit error: {e}")
        return True, 0


def log_download(user, platform, url, title, file_type, size_mb, status) -> Optional[int]:
    """تسجيل عملية التحميل وإرجاع ID"""
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
    """حذف الملفات المؤقتة القديمة"""
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
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def make_progress_bar(percent: float, length: int = 15) -> str:
    """إنشاء شريط تقدم مرئي"""
    percent = max(0, min(100, percent))
    filled = int(length * percent / 100)
    bar = "█" * filled + "░" * (length - filled)
    return f"[{bar}] {percent:.1f}%"


# ================== أوامر البداية ==================

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    register_user(user)

    keyboard = [
        [
            InlineKeyboardButton("📚 الأوامر", callback_data="help_cmds"),
            InlineKeyboardButton("🌐 المنصات المدعومة", callback_data="help_platforms"),
        ],
        [
            InlineKeyboardButton("⚙️ الإعدادات", callback_data="settings"),
            InlineKeyboardButton("📊 إحصائياتي", callback_data="my_stats"),
        ],
        [InlineKeyboardButton("ℹ️ كيف يعمل البوت", callback_data="how_it_works")],
    ]

    welcome_text = (
        f"👋 أهلاً بك يا {user.mention_html()}!\n\n"
        "🎬 <b>أنا بوت تحميل الوسائط من جميع مواقع التواصل!</b>\n\n"
        "<b>✨ المنصات المدعومة:</b>\n"
        "🔴 YouTube  •  🎵 TikTok  •  📷 Instagram\n"
        "🐦 Twitter/X  •  📘 Facebook  •  👻 Snapchat\n"
        "📌 Pinterest  •  🟠 Reddit  •  🎧 SoundCloud\n"
        "🎮 Twitch  •  🎬 Vimeo  •  + 1000 موقع\n\n"
        "<b>📥 الاستخدام بسيط:</b>\n"
        "أرسل أي رابط وسأحمّله لك فوراً!\n\n"
        "💡 <i>جرب الآن! أرسل لي أي رابط</i>"
    )

    if update.callback_query:
        await update.callback_query.edit_message_text(
            welcome_text, parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(keyboard))
    else:
        await update.message.reply_html(
            welcome_text, reply_markup=InlineKeyboardMarkup(keyboard))


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = (
        "📚 <b>الأوامر المتاحة</b>\n\n"
        "<b>🎬 التحميل:</b>\n"
        "فقط أرسل أي رابط وسأحمّله!\n\n"
        "<b>🔧 الأوامر:</b>\n"
        "<code>/start</code> - القائمة الرئيسية\n"
        "<code>/help</code> - هذه الرسالة\n"
        "<code>/audio [رابط]</code> - تحميل صوت MP3\n"
        "<code>/video [رابط]</code> - تحميل فيديو\n"
        "<code>/info [رابط]</code> - معلومات الفيديو\n"
        "<code>/stats</code> - إحصائياتك الشخصية\n"
        "<code>/platforms</code> - قائمة المنصات\n\n"
        "<b>📊 للمالك فقط:</b>\n"
        "<code>/admin</code> - لوحة الإدارة\n"
        "<code>/errors</code> - تقارير الأخطاء\n"
        "<code>/setcookies</code> - إضافة كوكيز\n"
        "<code>/broadcast [نص]</code> - بث للجميع\n"
        "<code>/ban [user_id]</code> - حظر مستخدم\n\n"
        "💡 <b>أمثلة:</b>\n"
        "<code>/audio https://youtu.be/xxx</code>\n"
        "<code>/info https://tiktok.com/xxx</code>"
    )
    await update.message.reply_html(text)


async def cmd_platforms(update: Update, context: ContextTypes.DEFAULT_TYPE):
    seen = set()
    text = "🌐 <b>المنصات المدعومة (الرئيسية):</b>\n\n"
    for name in SUPPORTED_PLATFORMS.values():
        if name not in seen:
            text += f"• {name}\n"
            seen.add(name)
    text += "\n💡 <b>+ أكثر من 1000 موقع آخر!</b>"
    await update.message.reply_html(text)


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    # الأزرار التفاعلية
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

    # القوائم
    texts = {
        "help_cmds": (
            "📚 <b>الأوامر</b>\n\n"
            "<b>للتحميل:</b>\n"
            "• فقط أرسل أي رابط\n"
            "• <code>/audio [رابط]</code> - صوت MP3\n"
            "• <code>/video [رابط]</code> - فيديو\n"
            "• <code>/info [رابط]</code> - معلومات\n\n"
            "<b>إعدادات:</b>\n"
            "• <code>/stats</code> - إحصائياتك"
        ),
        "help_platforms": "",  # سيُملأ تالياً
        "settings": "",
        "my_stats": "",
        "how_it_works": (
            "ℹ️ <b>كيف يعمل البوت؟</b>\n\n"
            "1️⃣ <b>أرسل الرابط</b>\n"
            "انسخ رابط الفيديو من أي تطبيق وأرسله للبوت\n\n"
            "2️⃣ <b>اختر النوع</b>\n"
            "ستظهر أزرار: 📹 فيديو / 🎵 صوت / ℹ️ معلومات\n\n"
            "3️⃣ <b>تابع التقدم</b>\n"
            "شريط تقدم مباشر لمعرفة حالة التحميل\n\n"
            "4️⃣ <b>قيّم الخدمة</b>\n"
            "بعد كل تحميل يمكنك تقييم التجربة بالنجوم ⭐\n\n"
            "<b>⚡ نصائح:</b>\n"
            "• الحد: 50 MB لكل ملف\n"
            "• 30 تحميل/ساعة\n"
            "• زر <b>إبلاغ المطور</b> عند أي خطأ"
        ),
    }

    if data == "help_platforms":
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
            "ستضاف خيارات إضافية قريباً.\n"
            "حالياً: عند إرسال رابط ستختار الجودة."
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
                """SELECT AVG(rating) as avg FROM downloads
                   WHERE user_id = ? AND rating > 0""",
                (query.from_user.id,),
            ).fetchone()

        downloads = user_data["downloads_count"] if user_data else 0
        joined = user_data["joined_at"][:10] if user_data else "غير معروف"
        avg = avg_rating["avg"] if avg_rating and avg_rating["avg"] else 0

        text = (
            "📊 <b>إحصائياتك:</b>\n\n"
            f"📥 إجمالي التحميلات: <b>{downloads}</b>\n"
            f"📅 تاريخ الانضمام: <b>{joined}</b>\n"
        )
        if avg > 0:
            stars = "⭐" * round(avg)
            text += f"💫 متوسط تقييماتك: <b>{avg:.1f}</b> {stars}\n"
        if top_platforms:
            text += "\n<b>🔥 أكثر منصاتك:</b>\n"
            for p in top_platforms:
                text += f"• {p['platform']} — {p['cnt']}\n"
    else:
        text = texts.get(data, "❓ خيار غير معروف")

    keyboard = [[InlineKeyboardButton("🔙 رجوع", callback_data="back_main")]]
    await query.edit_message_text(
        text, parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ================== التحميل المتقدم ==================

def get_ytdlp_options(url: str, format_type: str = "video", quality: str = "best",
                     output_template: str = None, progress_hook=None) -> dict:
    """
    إعدادات yt-dlp ذكية مع حلول مخصصة لكل منصة
    """
    if output_template is None:
        output_template = os.path.join(
            DOWNLOADS_DIR, f"{uuid.uuid4().hex[:12]}_%(title).80s.%(ext)s"
        )

    common = {
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": False,
        "max_filesize": MAX_FILE_SIZE_BYTES * 3,
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 5,
        "concurrent_fragment_downloads": 4,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
        },
    }

    if progress_hook:
        common["progress_hooks"] = [progress_hook]

    # === حلول خاصة بـ YouTube ===
    if is_youtube(url):
        # استخدام عدة player clients - حل فعال جداً للحصول على الفيديو
        common["extractor_args"] = {
            "youtube": {
                # ترتيب مهم! "tv_simply" و "android_vr" و "ios" تتجاوز الكثير من الحظر
                "player_client": ["tv_simply", "android_vr", "ios", "web_safari", "default"],
                "skip": ["dash", "hls"] if quality == "low" else [],
            }
        }
        # استخدم cookies إذا وُجدت
        if os.path.exists(YOUTUBE_COOKIES):
            common["cookiefile"] = YOUTUBE_COOKIES
            logger.info("📄 استخدام كوكيز YouTube")

    # === حلول خاصة بـ Instagram ===
    elif is_instagram(url):
        if os.path.exists(INSTAGRAM_COOKIES):
            common["cookiefile"] = INSTAGRAM_COOKIES

    # === حلول خاصة بـ Facebook ===
    elif is_facebook(url):
        if os.path.exists(FACEBOOK_COOKIES):
            common["cookiefile"] = FACEBOOK_COOKIES

    # === حلول خاصة بـ TikTok ===
    elif is_tiktok(url):
        if os.path.exists(TIKTOK_COOKIES):
            common["cookiefile"] = TIKTOK_COOKIES

    if format_type == "audio":
        common.update({
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
        })
    else:  # video
        # استراتيجية اختيار الجودة
        if quality == "best":
            # بفضّل الجودة المحدودة بحجم 50MB
            common["format"] = "best[filesize<50M]/best[height<=720]/best[height<=480]/best"
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
    """جلب معلومات الفيديو دون تحميل"""
    try:
        opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "socket_timeout": 30,
        }
        # استخدام نفس الحلول لـ YouTube
        if is_youtube(url):
            opts["extractor_args"] = {
                "youtube": {
                    "player_client": ["tv_simply", "android_vr", "ios", "web_safari", "default"],
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
    """متعقب تقدم التحميل لتحديث رسالة تيليجرام"""

    def __init__(self, context, chat_id, message_id, platform, format_type):
        self.context = context
        self.chat_id = chat_id
        self.message_id = message_id
        self.platform = platform
        self.format_type = format_type
        self.last_update = 0
        self.last_percent = -1
        self.phase = "downloading"  # downloading / processing / uploading
        self.loop = asyncio.get_event_loop()

    def hook(self, d):
        """يُستدعى من yt-dlp في خيط آخر"""
        try:
            status = d.get("status", "")

            if status == "downloading":
                downloaded = d.get("downloaded_bytes", 0)
                total = d.get("total_bytes") or d.get("total_bytes_estimate", 0)
                speed = d.get("speed", 0) or 0
                eta = d.get("eta", 0) or 0

                if total:
                    percent = (downloaded / total) * 100
                else:
                    percent = 0

                # تحديث فقط إذا اختلفت النسبة بـ 5% أو مرّت 3 ثواني
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

                    # جدولة التحديث في الـ event loop
                    asyncio.run_coroutine_threadsafe(
                        self._update_message(text), self.loop
                    )

            elif status == "finished":
                self.phase = "processing"
                text = (
                    f"⚙️ <b>جاري المعالجة من {self.platform}</b>\n\n"
                    f"[{'█' * 15}] 100%\n\n"
                    f"🔄 يتم تجهيز الملف للإرسال..."
                )
                asyncio.run_coroutine_threadsafe(
                    self._update_message(text), self.loop
                )

        except Exception as e:
            logger.debug(f"progress hook error: {e}")

    async def _update_message(self, text):
        """تحديث الرسالة بأمان"""
        try:
            await self.context.bot.edit_message_text(
                chat_id=self.chat_id,
                message_id=self.message_id,
                text=text,
                parse_mode=ParseMode.HTML,
            )
        except Exception:
            pass  # تجاهل أخطاء "message not modified"


# ================== تحميل الميديا الرئيسي ==================

async def download_media(url: str, format_type: str = "video", quality: str = "best",
                          progress_tracker: Optional[ProgressTracker] = None
                          ) -> Tuple[Optional[str], Optional[dict], Optional[str], Optional[str]]:
    """
    تحميل الوسائط مع timeout
    Returns: (file_path, info_dict, error_message, error_details)
    """
    try:
        progress_hook = progress_tracker.hook if progress_tracker else None
        opts = get_ytdlp_options(url, format_type, quality, progress_hook=progress_hook)

        loop = asyncio.get_event_loop()

        def _download():
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                if "requested_downloads" in info and info["requested_downloads"]:
                    filepath = info["requested_downloads"][0]["filepath"]
                else:
                    filepath = ydl.prepare_filename(info)
                    if format_type == "audio":
                        filepath = os.path.splitext(filepath)[0] + ".mp3"
                return filepath, info

        # ✅ timeout للتحميل
        filepath, info = await asyncio.wait_for(
            loop.run_in_executor(None, _download),
            timeout=DOWNLOAD_TIMEOUT_SEC,
        )

        if not os.path.exists(filepath):
            return None, info, "الملف لم يُحفظ بشكل صحيح", "File not found after download"

        return filepath, info, None, None

    except asyncio.TimeoutError:
        return (None, None,
                f"⏱ انتهت المهلة ({DOWNLOAD_TIMEOUT_SEC}s)",
                f"Download timeout exceeded {DOWNLOAD_TIMEOUT_SEC}s for URL: {url}")

    except yt_dlp.utils.DownloadError as e:
        err = str(e)
        details = traceback.format_exc()

        # رسائل خطأ مفهومة بالعربية
        if "Sign in to confirm" in err or "not a bot" in err:
            user_msg = (
                "🤖 <b>YouTube يطلب التحقق من البوت</b>\n\n"
                "هذا يحدث عند خوادم Cloud (مثل Render).\n"
                "💡 <b>الحلول:</b>\n"
                "• جرّب فيديو آخر (بعض الفيديوهات أكثر حساسية)\n"
                "• أبلغ المطور لإضافة كوكيز للموقع"
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
        else:
            user_msg = f"❌ خطأ في التحميل\n<code>{err[:150]}</code>"

        return None, None, user_msg, details

    except Exception as e:
        details = traceback.format_exc()
        return None, None, f"❌ خطأ غير متوقع: {str(e)[:100]}", details


# ================== معالج الروابط ==================

URL_PATTERN = re.compile(r"https?://[^\s]+")


async def handle_link(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معالج الروابط - عرض خيارات التحميل"""
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

    # فحص حد الاستخدام
    allowed, remaining = check_rate_limit(user.id)
    if not allowed:
        await update.message.reply_html(
            "⏳ <b>تجاوزت الحد المسموح!</b>\n"
            "30 تحميل في الساعة فقط.\n"
            "حاول بعد ساعة."
        )
        return

    context.user_data["pending_url"] = url
    context.user_data["pending_platform"] = platform

    keyboard = [
        [InlineKeyboardButton("📹 فيديو (أفضل جودة)", callback_data="dl_video_best")],
        [
            InlineKeyboardButton("📺 720p", callback_data="dl_video_high"),
            InlineKeyboardButton("📱 480p", callback_data="dl_video_medium"),
            InlineKeyboardButton("⚡ 240p", callback_data="dl_video_low"),
        ],
        [InlineKeyboardButton("🎵 صوت MP3", callback_data="dl_audio_best")],
        [
            InlineKeyboardButton("ℹ️ معلومات", callback_data="dl_info_none"),
            InlineKeyboardButton("❌ إلغاء", callback_data="cancel"),
        ],
    ]

    await update.message.reply_html(
        f"🔗 <b>الرابط مكتشف!</b>\n\n"
        f"📡 المنصة: {platform}\n"
        f"⏳ المتبقي لك: {remaining}/30\n\n"
        "اختر نوع التحميل:",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def handle_download_choice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معالج اختيار نوع التحميل مع شريط تقدم"""
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
            keyboard = [[InlineKeyboardButton("📢 إبلاغ المطور",
                                               callback_data=f"report_info_{user.id}")]]
            context.user_data["error_url"] = url
            context.user_data["error_platform"] = platform
            context.user_data["error_msg"] = "فشل جلب معلومات الفيديو"
            context.user_data["error_details"] = "get_video_info returned None"
            await query.edit_message_text(
                "❌ <b>فشل جلب المعلومات</b>\n\n"
                "قد يكون الرابط غير صالح أو الموقع لا يدعم استخراج المعلومات.",
                parse_mode=ParseMode.HTML,
                reply_markup=InlineKeyboardMarkup(keyboard),
            )
            return

        title = info.get("title", "غير معروف")[:100]
        uploader = info.get("uploader", "غير معروف")
        duration = format_duration(info.get("duration"))
        view_count = info.get("view_count", 0)
        like_count = info.get("like_count", 0)
        upload_date = info.get("upload_date", "")
        description = (info.get("description", "") or "")[:200]

        text = (
            f"ℹ️ <b>معلومات الفيديو</b>\n\n"
            f"📡 المنصة: {platform}\n"
            f"📝 العنوان: <b>{title}</b>\n"
            f"👤 الناشر: {uploader}\n"
            f"⏱ المدة: {duration}\n"
        )
        if view_count:
            text += f"👁 المشاهدات: {view_count:,}\n"
        if like_count:
            text += f"❤️ الإعجابات: {like_count:,}\n"
        if upload_date:
            try:
                d = datetime.strptime(upload_date, "%Y%m%d")
                text += f"📅 النشر: {d.strftime('%Y-%m-%d')}\n"
            except Exception:
                pass
        if description:
            text += f"\n📄 <i>{description}...</i>"

        keyboard = [[InlineKeyboardButton("📥 تحميل الآن", callback_data="dl_video_best")]]
        await query.edit_message_text(text, parse_mode=ParseMode.HTML,
                                       reply_markup=InlineKeyboardMarkup(keyboard))
        return

    # === التحميل الفعلي مع شريط تقدم ===
    await query.edit_message_text(
        f"⏳ <b>بدء التحميل من {platform}...</b>\n\n"
        f"🔍 جاري الاتصال بالموقع...",
        parse_mode=ParseMode.HTML,
    )

    await context.bot.send_chat_action(
        chat_id=query.message.chat_id,
        action=ChatAction.UPLOAD_VIDEO if format_type == "video" else ChatAction.UPLOAD_AUDIO,
    )

    # إنشاء متعقب التقدم
    progress_tracker = ProgressTracker(
        context, query.message.chat_id, query.message.message_id,
        platform, format_type
    )

    # التحميل
    filepath, info, error, error_details = await download_media(
        url, format_type, quality, progress_tracker
    )

    # === حالة الفشل ===
    if error or not filepath:
        # حفظ معلومات الخطأ في user_data للـ callback
        context.user_data["error_url"] = url
        context.user_data["error_platform"] = platform
        context.user_data["error_msg"] = error
        context.user_data["error_details"] = error_details or "Unknown error"

        keyboard = [
            [InlineKeyboardButton("🔄 إعادة المحاولة", callback_data=f"dl_{format_type}_{quality}")],
            [InlineKeyboardButton("📢 إبلاغ المطور", callback_data=f"report_dl_{user.id}")],
        ]

        await query.edit_message_text(
            f"❌ <b>فشل التحميل</b>\n\n{error}",
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
        log_download(user, platform, url, "", format_type, 0, "failed")
        return

    # === فحص حجم الملف ===
    file_size = os.path.getsize(filepath)
    file_size_mb = file_size / (1024 * 1024)

    if file_size > MAX_FILE_SIZE_BYTES:
        keyboard = [
            [InlineKeyboardButton("🎵 جرّب الصوت فقط", callback_data="dl_audio_best")],
            [InlineKeyboardButton("⚡ جرّب جودة أقل (240p)", callback_data="dl_video_low")],
        ]
        await query.edit_message_text(
            f"⚠️ <b>الملف كبير جداً</b>\n\n"
            f"💾 الحجم: {file_size_mb:.1f} MB\n"
            f"📦 الحد الأقصى: {MAX_FILE_SIZE_MB} MB\n\n"
            "💡 جرّب أحد الخيارات أدناه:",
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
        try:
            os.remove(filepath)
        except Exception:
            pass
        log_download(user, platform, url, info.get("title", "") if info else "",
                    format_type, file_size_mb, "too_large")
        return

    # === تحديث: جاري الرفع ===
    await query.edit_message_text(
        f"📤 <b>جاري الرفع إلى تيليجرام...</b>\n\n"
        f"💾 حجم الملف: {format_size(file_size)}\n"
        f"📡 {platform}",
        parse_mode=ParseMode.HTML,
    )

    # === الإرسال ===
    title = (info.get("title", "") if info else "")[:200]
    uploader = info.get("uploader", "") if info else ""
    duration = info.get("duration") if info else None

    caption = f"📡 <b>{platform}</b>\n"
    if title:
        caption += f"📝 {title}\n"
    if uploader:
        caption += f"👤 {uploader}\n"
    caption += f"\n💾 {format_size(file_size)}"
    caption += f"\n🤖 @{context.bot.username}"

    try:
        with open(filepath, "rb") as f:
            if format_type == "audio":
                await context.bot.send_audio(
                    chat_id=query.message.chat_id,
                    audio=f,
                    caption=caption,
                    parse_mode=ParseMode.HTML,
                    title=title[:64] if title else None,
                    performer=uploader[:64] if uploader else None,
                    duration=duration,
                )
            else:
                await context.bot.send_video(
                    chat_id=query.message.chat_id,
                    video=f,
                    caption=caption,
                    parse_mode=ParseMode.HTML,
                    duration=duration,
                    supports_streaming=True,
                )

        # === تسجيل وعرض رسالة نجاح + تقييم ===
        download_id = log_download(user, platform, url, title, format_type, file_size_mb, "success")

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

        await query.edit_message_text(
            f"✅ <b>تم الإرسال بنجاح!</b>\n\n"
            f"📡 {platform}\n"
            f"💾 {format_size(file_size)}\n\n"
            f"🌟 <b>كيف كانت تجربتك؟</b>\n"
            f"<i>قيّم الخدمة لمساعدتنا على التطوير</i>",
            parse_mode=ParseMode.HTML,
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
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
        log_download(user, platform, url, title, format_type, file_size_mb, "send_failed")
    finally:
        try:
            os.remove(filepath)
        except Exception:
            pass

        context.user_data.pop("pending_url", None)
        context.user_data.pop("pending_platform", None)


# ================== التقييم ==================

async def handle_rating(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معالج التقييم بالنجوم"""
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
            f"✅ <b>شكراً لتقييمك!</b>\n\n"
            f"تقييمك: {stars} ({rating}/5)\n\n"
            f"<i>تقييماتك تساعدنا على تحسين الخدمة 💙</i>",
            parse_mode=ParseMode.HTML,
        )
    except Exception as e:
        logger.error(f"rating error: {e}")
        await query.answer("❌ فشل حفظ التقييم", show_alert=True)


# ================== الإبلاغ عن الأخطاء ==================

async def handle_report_error(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """إرسال تقرير عن الخطأ للمطور"""
    query = update.callback_query
    user = query.from_user

    url = context.user_data.get("error_url", "غير معروف")
    platform = context.user_data.get("error_platform", "غير معروف")
    error_msg = context.user_data.get("error_msg", "غير معروف")
    error_details = context.user_data.get("error_details", "")

    try:
        # حفظ في قاعدة البيانات
        with get_db() as conn:
            cur = conn.execute(
                """INSERT INTO error_reports (user_id, username, url, platform, error_message, error_details)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (user.id, user.username or "", url, platform, error_msg, error_details),
            )
            report_id = cur.lastrowid

        # إرسال للمطور
        if OWNER_ID:
            developer_text = (
                f"🚨 <b>تقرير خطأ جديد #{report_id}</b>\n\n"
                f"👤 <b>المستخدم:</b> {user.mention_html()}\n"
                f"🆔 <b>ID:</b> <code>{user.id}</code>\n"
                f"📡 <b>المنصة:</b> {platform}\n"
                f"🔗 <b>الرابط:</b>\n<code>{url[:200]}</code>\n\n"
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
                    chat_id=OWNER_ID,
                    text=developer_text,
                    parse_mode=ParseMode.HTML,
                    reply_markup=InlineKeyboardMarkup(keyboard),
                )

                # إذا كانت التفاصيل طويلة، أرسلها كملف
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
                            chat_id=OWNER_ID,
                            document=f,
                            filename=f"error_{report_id}.txt",
                            caption=f"📋 تفاصيل التقرير #{report_id}",
                        )
            except Exception as e:
                logger.error(f"إرسال للمطور فشل: {e}")

        await query.edit_message_text(
            f"✅ <b>تم إرسال تقرير الخطأ</b>\n\n"
            f"📋 رقم التقرير: <code>#{report_id}</code>\n\n"
            f"<i>المطور سيراجع الخطأ ويعمل على حله.\n"
            f"شكراً لمساعدتنا في التطوير 💙</i>",
            parse_mode=ParseMode.HTML,
        )

    except Exception as e:
        logger.exception("report error")
        await query.edit_message_text(f"❌ فشل إرسال التقرير: {str(e)[:100]}")


async def handle_error_action(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """إجراءات المطور على التقارير"""
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
            report = conn.execute(
                "SELECT * FROM error_reports WHERE id = ?", (report_id,)
            ).fetchone()

        if not report:
            await query.answer("❌ التقرير غير موجود", show_alert=True)
            return

        if action == "details":
            details = report["error_details"][:3500] if report["error_details"] else "لا توجد تفاصيل"
            await query.message.reply_html(
                f"📋 <b>تفاصيل التقرير #{report_id}</b>\n\n"
                f"<code>{details}</code>"
            )
            await query.answer()

        elif action == "resolve":
            with get_db() as conn:
                conn.execute(
                    "UPDATE error_reports SET status = 'resolved' WHERE id = ?",
                    (report_id,),
                )
            await query.answer("✅ تم وضع علامة 'محلول'", show_alert=True)

            # إعلام المستخدم
            try:
                await context.bot.send_message(
                    chat_id=report["user_id"],
                    text=f"✅ <b>تم حل المشكلة!</b>\n\n"
                         f"تقريرك #{report_id} تمت معالجته.\n"
                         f"يمكنك تجربة التحميل مرة أخرى.",
                    parse_mode=ParseMode.HTML,
                )
            except Exception:
                pass

        elif action == "reply":
            context.user_data["replying_to_report"] = report_id
            context.user_data["replying_to_user"] = report["user_id"]
            await query.message.reply_text(
                f"💬 أرسل ردك للمستخدم الآن (سيُرسل كرد على التقرير #{report_id})"
            )

    except Exception as e:
        logger.exception("error action")
        await query.answer(f"❌ خطأ: {str(e)[:50]}", show_alert=True)


async def handle_owner_reply(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """التعامل مع رد المطور على المستخدم"""
    if update.effective_user.id != OWNER_ID:
        return

    report_id = context.user_data.get("replying_to_report")
    user_id = context.user_data.get("replying_to_user")

    if not report_id or not user_id:
        return

    reply_text = update.message.text or ""
    if reply_text.startswith("/"):
        return  # تجاهل الأوامر

    try:
        await context.bot.send_message(
            chat_id=user_id,
            text=f"💬 <b>رد من المطور بخصوص تقريرك #{report_id}:</b>\n\n{reply_text}",
            parse_mode=ParseMode.HTML,
        )
        await update.message.reply_text("✅ تم إرسال ردك للمستخدم")
        context.user_data.pop("replying_to_report", None)
        context.user_data.pop("replying_to_user", None)
    except Exception as e:
        await update.message.reply_text(f"❌ فشل الإرسال: {e}")


# ================== أوامر سريعة ==================

async def cmd_audio(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """تحميل سريع للصوت"""
    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /audio [رابط]")
        return
    url = context.args[0]
    if not URL_PATTERN.match(url):
        await update.message.reply_text("❌ رابط غير صالح")
        return

    user = update.effective_user
    register_user(user)
    if is_user_banned(user.id):
        return

    allowed, _ = check_rate_limit(user.id)
    if not allowed:
        await update.message.reply_text("⏳ تجاوزت الحد المسموح!")
        return

    context.user_data["pending_url"] = url
    context.user_data["pending_platform"] = detect_platform(url) or "🌐 موقع"

    # محاكاة كأن المستخدم ضغط زر "صوت MP3"
    fake_update = Update(update.update_id, callback_query=type('obj', (object,), {
        'data': 'dl_audio_best',
        'from_user': user,
        'message': await update.message.reply_text("⏳ بدء التحميل..."),
        'answer': lambda: asyncio.sleep(0),
        'edit_message_text': lambda *a, **k: update.message.reply_text(*a, **{k_: v for k_, v in k.items() if k_ in ['parse_mode', 'reply_markup']})
    })())
    # حل أبسط: نستخدم نفس handler
    msg = await update.message.reply_html(f"⏳ بدء التحميل من {context.user_data['pending_platform']}...")
    
    progress = ProgressTracker(context, msg.chat_id, msg.message_id,
                                context.user_data["pending_platform"], "audio")
    filepath, info, error, details = await download_media(url, "audio", "best", progress)

    if error or not filepath:
        context.user_data["error_url"] = url
        context.user_data["error_platform"] = context.user_data["pending_platform"]
        context.user_data["error_msg"] = error
        context.user_data["error_details"] = details or ""
        keyboard = [[InlineKeyboardButton("📢 إبلاغ المطور", callback_data=f"report_dl_{user.id}")]]
        await msg.edit_text(f"❌ {error}", parse_mode=ParseMode.HTML,
                             reply_markup=InlineKeyboardMarkup(keyboard))
        return

    size = os.path.getsize(filepath)
    if size > MAX_FILE_SIZE_BYTES:
        await msg.edit_text(f"⚠️ الملف كبير ({size/(1024*1024):.1f} MB)")
        os.remove(filepath)
        return

    title = (info.get("title", "") if info else "")[:200]
    try:
        await msg.edit_text(f"📤 جاري الرفع... ({format_size(size)})")
        with open(filepath, "rb") as f:
            await context.bot.send_audio(
                update.effective_chat.id, f,
                caption=f"🎵 {title}\n🤖 @{context.bot.username}",
                title=title[:64] if title else None,
            )
        download_id = log_download(user, context.user_data["pending_platform"],
                                    url, title, "audio", size/(1024*1024), "success")
        rating_kb = [[
            InlineKeyboardButton(f"{'⭐' * i}", callback_data=f"rate_{download_id}_{i}")
            for i in range(1, 6)
        ]]
        await msg.edit_text(
            "✅ تم! قيّم تجربتك:",
            reply_markup=InlineKeyboardMarkup(rating_kb)
        )
    except Exception as e:
        await msg.edit_text(f"❌ خطأ: {str(e)[:100]}")
    finally:
        try:
            os.remove(filepath)
        except Exception:
            pass


async def cmd_video(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """تحميل سريع للفيديو"""
    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /video [رابط]")
        return
    url = context.args[0]
    if not URL_PATTERN.match(url):
        await update.message.reply_text("❌ رابط غير صالح")
        return

    user = update.effective_user
    register_user(user)
    if is_user_banned(user.id):
        return

    allowed, _ = check_rate_limit(user.id)
    if not allowed:
        await update.message.reply_text("⏳ تجاوزت الحد المسموح!")
        return

    platform = detect_platform(url) or "🌐 موقع"
    msg = await update.message.reply_html(f"⏳ بدء التحميل من {platform}...")
    
    progress = ProgressTracker(context, msg.chat_id, msg.message_id, platform, "video")
    filepath, info, error, details = await download_media(url, "video", "best", progress)

    if error or not filepath:
        context.user_data["error_url"] = url
        context.user_data["error_platform"] = platform
        context.user_data["error_msg"] = error
        context.user_data["error_details"] = details or ""
        keyboard = [[InlineKeyboardButton("📢 إبلاغ المطور", callback_data=f"report_dl_{user.id}")]]
        await msg.edit_text(f"❌ {error}", parse_mode=ParseMode.HTML,
                             reply_markup=InlineKeyboardMarkup(keyboard))
        return

    size = os.path.getsize(filepath)
    if size > MAX_FILE_SIZE_BYTES:
        await msg.edit_text(f"⚠️ الملف كبير ({size/(1024*1024):.1f} MB)\nجرب /audio")
        os.remove(filepath)
        return

    title = (info.get("title", "") if info else "")[:200]
    duration = info.get("duration") if info else None
    try:
        await msg.edit_text(f"📤 جاري الرفع... ({format_size(size)})")
        with open(filepath, "rb") as f:
            await context.bot.send_video(
                update.effective_chat.id, f,
                caption=f"📹 {title}\n📡 {platform}\n🤖 @{context.bot.username}",
                duration=duration,
                supports_streaming=True,
            )
        download_id = log_download(user, platform, url, title, "video", size/(1024*1024), "success")
        rating_kb = [[
            InlineKeyboardButton(f"{'⭐' * i}", callback_data=f"rate_{download_id}_{i}")
            for i in range(1, 6)
        ]]
        await msg.edit_text("✅ تم! قيّم تجربتك:",
                            reply_markup=InlineKeyboardMarkup(rating_kb))
    except Exception as e:
        await msg.edit_text(f"❌ خطأ: {str(e)[:100]}")
    finally:
        try:
            os.remove(filepath)
        except Exception:
            pass


async def cmd_info(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /info [رابط]")
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
        f"ℹ️ <b>معلومات الفيديو</b>\n\n"
        f"📡 {platform}\n"
        f"📝 <b>{info.get('title', 'غير معروف')[:100]}</b>\n"
        f"👤 {info.get('uploader', 'غير معروف')}\n"
        f"⏱ {format_duration(info.get('duration'))}\n"
    )
    views = info.get("view_count", 0)
    if views:
        text += f"👁 {views:,} مشاهدة\n"

    await msg.edit_text(text, parse_mode=ParseMode.HTML)


async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    with get_db() as conn:
        user_data = conn.execute(
            "SELECT downloads_count, joined_at FROM users WHERE user_id = ?",
            (user.id,),
        ).fetchone()
        platforms = conn.execute(
            """SELECT platform, COUNT(*) as cnt FROM downloads
               WHERE user_id = ? AND status = 'success'
               GROUP BY platform ORDER BY cnt DESC LIMIT 5""",
            (user.id,),
        ).fetchall()
        recent = conn.execute(
            """SELECT COUNT(*) as cnt FROM downloads
               WHERE user_id = ? AND status = 'success'
               AND downloaded_at > datetime('now', '-7 days')""",
            (user.id,),
        ).fetchone()
        avg_rating = conn.execute(
            """SELECT AVG(rating) as avg FROM downloads
               WHERE user_id = ? AND rating > 0""",
            (user.id,),
        ).fetchone()

    if not user_data:
        await update.message.reply_text("📭 لا توجد إحصائيات بعد. ابدأ بالتحميل!")
        return

    text = (
        f"📊 <b>إحصائياتك</b>\n\n"
        f"📥 الإجمالي: <b>{user_data['downloads_count']}</b>\n"
        f"📅 آخر 7 أيام: <b>{recent['cnt']}</b>\n"
    )
    if avg_rating and avg_rating["avg"]:
        text += f"⭐ متوسط التقييم: <b>{avg_rating['avg']:.1f}/5</b>\n"
    text += f"🗓 منذ: {user_data['joined_at'][:10]}\n"

    if platforms:
        text += "\n<b>🏆 منصاتك المفضلة:</b>\n"
        for p in platforms:
            text += f"• {p['platform']} — {p['cnt']}\n"

    await update.message.reply_html(text)


# ================== أوامر الإدارة ==================

async def cmd_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
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
        avg_rating = conn.execute(
            "SELECT AVG(rating) as avg FROM downloads WHERE rating > 0"
        ).fetchone()
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
        f"📥 إجمالي التحميلات: <b>{total_dl:,}</b>\n"
        f"📅 تحميلات اليوم: <b>{today_dl}</b>\n"
        f"⭐ متوسط التقييم: <b>{avg:.2f}/5</b>\n\n"
        f"🚨 تقارير معلّقة: <b>{pending_errors}</b>\n\n"
        f"💾 حجم DB: <b>{db_size:.2f} MB</b>\n"
        f"💿 المساحة: <b>{free_mb:.0f}/{total_mb:.0f} MB</b>\n"
    )
    if top_platforms:
        text += "\n<b>🏆 أكثر المنصات:</b>\n"
        for p in top_platforms:
            text += f"• {p['platform']} — {p['cnt']:,}\n"

    text += (
        "\n<b>الأوامر:</b>\n"
        "<code>/errors</code> - تقارير الأخطاء\n"
        "<code>/setcookies [موقع]</code> - إضافة كوكيز\n"
        "<code>/broadcast [نص]</code>\n"
        "<code>/ban [user_id]</code>\n"
        "<code>/cleanup</code>"
    )
    await update.message.reply_html(text)


async def cmd_errors(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """عرض تقارير الأخطاء"""
    if update.effective_user.id != OWNER_ID:
        return

    with get_db() as conn:
        reports = conn.execute(
            """SELECT id, username, url, platform, error_message, reported_at, status
               FROM error_reports ORDER BY reported_at DESC LIMIT 10"""
        ).fetchall()

    if not reports:
        await update.message.reply_text("📭 لا توجد تقارير أخطاء.")
        return

    text = "🚨 <b>آخر 10 تقارير:</b>\n\n"
    for r in reports:
        status_emoji = "🟡" if r["status"] == "pending" else "✅"
        text += (
            f"{status_emoji} <b>#{r['id']}</b> — {r['platform']}\n"
            f"👤 @{r['username'] or '?'}\n"
            f"❌ {r['error_message'][:80]}\n"
            f"📅 {r['reported_at'][:16]}\n\n"
        )
    await update.message.reply_html(text)


async def cmd_setcookies(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """إعدادات الكوكيز للمواقع التي تتطلبها"""
    if update.effective_user.id != OWNER_ID:
        return

    text = (
        "🍪 <b>إعداد ملفات الكوكيز</b>\n\n"
        "للحل الكامل لمشاكل YouTube/Instagram/Facebook،\n"
        "أرسل ملف cookies.txt كرد على هذه الرسالة\n"
        "مع caption يحدد الموقع:\n\n"
        "• <code>youtube</code>\n"
        "• <code>instagram</code>\n"
        "• <code>facebook</code>\n"
        "• <code>tiktok</code>\n\n"
        "<b>📥 كيفية الحصول على الكوكيز:</b>\n"
        "1. ثبّت إضافة <b>Get cookies.txt LOCALLY</b> على Chrome/Firefox\n"
        "2. سجّل دخولك للموقع المطلوب\n"
        "3. اضغط على الإضافة → Export\n"
        "4. أرسل الملف هنا\n\n"
        f"📁 <b>الكوكيز الموجودة:</b>\n"
    )
    for name, path in [("YouTube", YOUTUBE_COOKIES), ("Instagram", INSTAGRAM_COOKIES),
                        ("Facebook", FACEBOOK_COOKIES), ("TikTok", TIKTOK_COOKIES)]:
        text += f"• {name}: {'✅ موجود' if os.path.exists(path) else '❌ غير موجود'}\n"

    await update.message.reply_html(text)


async def handle_cookies_upload(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """استقبال ملف الكوكيز من المالك"""
    if update.effective_user.id != OWNER_ID:
        return

    if not update.message.document:
        return

    caption = (update.message.caption or "").lower().strip()
    cookies_map = {
        "youtube": YOUTUBE_COOKIES,
        "instagram": INSTAGRAM_COOKIES,
        "facebook": FACEBOOK_COOKIES,
        "tiktok": TIKTOK_COOKIES,
    }

    target = None
    for site, path in cookies_map.items():
        if site in caption:
            target = path
            break

    if not target:
        await update.message.reply_text(
            "⚠️ ضع caption: youtube/instagram/facebook/tiktok"
        )
        return

    try:
        file = await update.message.document.get_file()
        await file.download_to_drive(target)
        await update.message.reply_text(f"✅ تم حفظ ملف الكوكيز في:\n<code>{target}</code>",
                                         parse_mode=ParseMode.HTML)
    except Exception as e:
        await update.message.reply_text(f"❌ فشل: {e}")


async def cmd_broadcast(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != OWNER_ID:
        return
    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /broadcast [الرسالة]")
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
    await status.edit_text(f"✅ تم!\n📤 ناجحة: {sent}\n❌ فاشلة: {failed}")


async def cmd_ban_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != OWNER_ID:
        return
    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /ban [user_id]")
        return
    try:
        user_id = int(context.args[0])
        with get_db() as conn:
            conn.execute("UPDATE users SET is_banned=1 WHERE user_id=?", (user_id,))
        await update.message.reply_text(f"🚫 تم حظر {user_id}")
    except Exception as e:
        await update.message.reply_text(f"❌ خطأ: {e}")


async def cmd_unban_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != OWNER_ID:
        return
    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /unban [user_id]")
        return
    try:
        user_id = int(context.args[0])
        with get_db() as conn:
            conn.execute("UPDATE users SET is_banned=0 WHERE user_id=?", (user_id,))
        await update.message.reply_text(f"✅ تم إلغاء حظر {user_id}")
    except Exception as e:
        await update.message.reply_text(f"❌ خطأ: {e}")


async def cmd_cleanup(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != OWNER_ID:
        return
    cleanup_old_files()
    files = os.listdir(DOWNLOADS_DIR)
    await update.message.reply_text(f"🧹 تم. الملفات المتبقية: {len(files)}")


# ================== ويب سيرفر ==================

async def health_check(request):
    return web.json_response({
        "status": "alive",
        "bot": "media downloader v2",
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


async def periodic_cleanup(context: ContextTypes.DEFAULT_TYPE):
    cleanup_old_files()


# ================== التشغيل ==================

async def setup_commands(application: Application):
    commands = [
        BotCommand("start", "🚀 بدء البوت"),
        BotCommand("help", "📚 المساعدة"),
        BotCommand("audio", "🎵 تحميل صوت MP3"),
        BotCommand("video", "📹 تحميل فيديو"),
        BotCommand("info", "ℹ️ معلومات الفيديو"),
        BotCommand("platforms", "🌐 المنصات المدعومة"),
        BotCommand("stats", "📊 إحصائياتي"),
    ]
    await application.bot.set_my_commands(commands)


async def post_init(application: Application):
    await setup_commands(application)
    await start_web_server()
    application.job_queue.run_repeating(periodic_cleanup, interval=600, first=600)
    logger.info("✅ البوت v2 جاهز!")
    logger.info(f"💾 DB: {DB_PATH}")
    logger.info(f"📥 Downloads: {DOWNLOADS_DIR}")
    logger.info(f"🍪 Cookies: {COOKIES_DIR}")


def main():
    if not BOT_TOKEN:
        logger.error("❌ BOT_TOKEN غير معرّف!")
        return

    init_database()

    application = Application.builder().token(BOT_TOKEN).post_init(post_init).build()

    # الأوامر
    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("help", cmd_help))
    application.add_handler(CommandHandler("audio", cmd_audio))
    application.add_handler(CommandHandler("video", cmd_video))
    application.add_handler(CommandHandler("info", cmd_info))
    application.add_handler(CommandHandler("platforms", cmd_platforms))
    application.add_handler(CommandHandler("stats", cmd_stats))

    # الإدارة
    application.add_handler(CommandHandler("admin", cmd_admin))
    application.add_handler(CommandHandler("errors", cmd_errors))
    application.add_handler(CommandHandler("setcookies", cmd_setcookies))
    application.add_handler(CommandHandler("broadcast", cmd_broadcast))
    application.add_handler(CommandHandler("ban", cmd_ban_user))
    application.add_handler(CommandHandler("unban", cmd_unban_user))
    application.add_handler(CommandHandler("cleanup", cmd_cleanup))

    # الأزرار
    application.add_handler(CallbackQueryHandler(callback_handler))

    # رفع ملف الكوكيز (مستندات من المالك)
    application.add_handler(
        MessageHandler(filters.Document.ALL & filters.User(OWNER_ID), handle_cookies_upload)
    )

    # رد المطور على المستخدمين
    application.add_handler(
        MessageHandler(
            filters.TEXT & ~filters.COMMAND & filters.User(OWNER_ID),
            handle_owner_reply,
        ),
        group=1,
    )

    # معالج الروابط (الأولوية الأخيرة)
    application.add_handler(
        MessageHandler(
            filters.TEXT & ~filters.COMMAND & filters.Regex(URL_PATTERN),
            handle_link,
        ),
        group=2,
    )

    logger.info("🚀 البوت يبدأ العمل...")
    application.run_polling(drop_pending_updates=True, allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
