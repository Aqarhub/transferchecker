"""
🎬 بوت تحميل الوسائط v4.0 - الإصلاحات الجذرية
================================================
الإصلاحات في v4:
  ✅ TikTok بدون علامة مائية (api_app + format selection)
  ✅ YouTube: حل "Requested format is not available" بـ retry strategy
  ✅ Instagram/Facebook: تحميل بدون علامة بـ player_client الصحيح
  ✅ مشكلة timeout مع الجودة العالية: استخدام single-file formats
  ✅ تحديث yt-dlp تلقائياً عند بدء التشغيل
  ✅ Fallback ذكي بين clients مختلفة
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
import subprocess
from datetime import datetime
from typing import Optional, Dict, List, Tuple
from contextlib import contextmanager
from urllib.parse import urlparse

import yt_dlp
from telegram import (
    Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand,
    InputMediaPhoto,
)
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters,
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
MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024
TEMP_FILE_LIFETIME_MIN = 10
DOWNLOAD_TIMEOUT_SEC = 240  # زدنا 4 دقائق لجودة عالية
PROGRESS_UPDATE_INTERVAL_SEC = 3

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(DOWNLOADS_DIR, exist_ok=True)
os.makedirs(COOKIES_DIR, exist_ok=True)
os.makedirs(ERROR_LOGS_DIR, exist_ok=True)

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logging.getLogger("yt_dlp").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

# ================== المنصات ==================

SUPPORTED_PLATFORMS = {
    "youtube.com": "🔴 YouTube", "youtu.be": "🔴 YouTube",
    "tiktok.com": "🎵 TikTok", "vm.tiktok.com": "🎵 TikTok",
    "instagram.com": "📷 Instagram",
    "twitter.com": "🐦 Twitter/X", "x.com": "🐦 Twitter/X",
    "facebook.com": "📘 Facebook", "fb.watch": "📘 Facebook", "fb.com": "📘 Facebook",
    "snapchat.com": "👻 Snapchat",
    "pinterest.com": "📌 Pinterest", "pin.it": "📌 Pinterest",
    "reddit.com": "🟠 Reddit", "redd.it": "🟠 Reddit",
    "soundcloud.com": "🎧 SoundCloud", "twitch.tv": "🎮 Twitch",
    "vimeo.com": "🎬 Vimeo", "dailymotion.com": "🎥 Dailymotion",
    "linkedin.com": "💼 LinkedIn", "threads.net": "🧵 Threads",
    "kick.com": "🟢 Kick", "bilibili.com": "📺 Bilibili", "9gag.com": "😂 9GAG",
}

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


def is_likely_image_url(url: str) -> bool:
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
        cur.execute("CREATE INDEX IF NOT EXISTS idx_dl_user ON downloads(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_dl_platform ON downloads(platform)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_err_status ON error_reports(status)")
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
            row = conn.execute("SELECT count, reset_at FROM rate_limits WHERE user_id = ?", (user_id,)).fetchone()
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
                conn.execute("UPDATE users SET downloads_count = downloads_count + 1 WHERE user_id = ?", (user.id,))
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


def update_yt_dlp():
    """تحديث yt-dlp تلقائياً عند بدء التشغيل (مهم جداً!)"""
    try:
        logger.info("🔄 جاري تحديث yt-dlp...")
        result = subprocess.run(
            ["pip", "install", "-U", "--no-deps", "yt-dlp"],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode == 0:
            logger.info("✅ تم تحديث yt-dlp")
        else:
            logger.warning(f"⚠️ فشل التحديث: {result.stderr[:200]}")
    except Exception as e:
        logger.warning(f"⚠️ فشل تحديث yt-dlp: {e}")


# ================== أوامر البداية ==================

async def cmd_start(update, context):
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
        [InlineKeyboardButton("ℹ️ كيف يعمل", callback_data="how_it_works")],
    ]
    welcome_text = (
        f"👋 أهلاً {user.mention_html()}!\n\n"
        "🎬 <b>بوت تحميل الفيديوهات والصور والصوت!</b>\n\n"
        "<b>✨ يدعم:</b>\n"
        "🔴 YouTube  •  🎵 TikTok (بدون علامة)  •  📷 Instagram\n"
        "🐦 Twitter/X  •  📘 Facebook  •  👻 Snapchat\n"
        "📌 Pinterest  •  🟠 Reddit  •  🎧 SoundCloud\n"
        "🎮 Twitch  •  🎬 Vimeo  •  + 1000 موقع\n\n"
        "<b>📥 الميزات:</b>\n"
        "• تحميل بدون علامات مائية ✨\n"
        "• فيديو + صوت + صور 📸\n"
        "• ألبومات الصور كاملة 🖼️\n"
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


async def cmd_help(update, context):
    text = (
        "📚 <b>الأوامر</b>\n\n"
        "<b>🎬 التحميل:</b>\nأرسل أي رابط!\n\n"
        "<b>🔧 الأوامر:</b>\n"
        "<code>/audio [رابط]</code> - MP3\n"
        "<code>/video [رابط]</code> - فيديو\n"
        "<code>/photo [رابط]</code> - صور\n"
        "<code>/info [رابط]</code> - معلومات\n"
        "<code>/stats</code> - إحصائياتي\n"
        "<code>/platforms</code> - المنصات\n\n"
        "<b>📊 للمالك:</b>\n"
        "<code>/admin</code> - لوحة الإدارة\n"
        "<code>/errors</code> - تقارير الأخطاء\n"
        "<code>/setcookies</code> - إضافة كوكيز\n"
        "<code>/update</code> - تحديث yt-dlp\n"
        "<code>/broadcast [نص]</code> - بث للجميع"
    )
    await update.message.reply_html(text)


async def cmd_platforms(update, context):
    seen = set()
    text = "🌐 <b>المنصات:</b>\n\n"
    for name in SUPPORTED_PLATFORMS.values():
        if name not in seen:
            text += f"• {name}\n"
            seen.add(name)
    text += "\n💡 <b>+ 1000 موقع آخر!</b>"
    await update.message.reply_html(text)


async def callback_handler(update, context):
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
            "📚 <b>الأوامر</b>\n\nأرسل أي رابط!\n\n"
            "<code>/audio [رابط]</code> - MP3\n"
            "<code>/video [رابط]</code> - فيديو\n"
            "<code>/photo [رابط]</code> - صور\n"
            "<code>/info [رابط]</code> - معلومات\n"
            "<code>/stats</code> - إحصائياتي"
        )
    elif data == "help_platforms":
        seen = set()
        plat_text = ""
        for name in SUPPORTED_PLATFORMS.values():
            if name not in seen:
                plat_text += f"• {name}\n"
                seen.add(name)
        text = f"🌐 <b>المنصات:</b>\n\n{plat_text}\n💡 <b>+ 1000 موقع!</b>"
    elif data == "settings":
        text = "⚙️ <b>الإعدادات</b>\n\nستضاف خيارات قريباً."
    elif data == "my_stats":
        with get_db() as conn:
            user_data = conn.execute(
                "SELECT downloads_count, joined_at FROM users WHERE user_id = ?",
                (query.from_user.id,)).fetchone()
            top_platforms = conn.execute(
                """SELECT platform, COUNT(*) as cnt FROM downloads
                   WHERE user_id = ? AND status = 'success'
                   GROUP BY platform ORDER BY cnt DESC LIMIT 5""",
                (query.from_user.id,)).fetchall()
            avg = conn.execute(
                "SELECT AVG(rating) as avg FROM downloads WHERE user_id = ? AND rating > 0",
                (query.from_user.id,)).fetchone()
        downloads = user_data["downloads_count"] if user_data else 0
        joined = user_data["joined_at"][:10] if user_data else "غير معروف"
        avg_v = avg["avg"] if avg and avg["avg"] else 0
        text = f"📊 <b>إحصائياتك:</b>\n\n📥 الإجمالي: <b>{downloads}</b>\n📅 منذ: <b>{joined}</b>\n"
        if avg_v > 0:
            text += f"💫 متوسط: <b>{avg_v:.1f}/5</b>\n"
        if top_platforms:
            text += "\n<b>🔥 منصاتك:</b>\n"
            for p in top_platforms:
                text += f"• {p['platform']} — {p['cnt']}\n"
    elif data == "how_it_works":
        text = (
            "ℹ️ <b>كيف يعمل البوت؟</b>\n\n"
            "1️⃣ أرسل أي رابط\n"
            "2️⃣ اختر النوع المطلوب\n"
            "3️⃣ تابع شريط التقدم\n"
            "4️⃣ يصلك الملف ✅\n"
            "5️⃣ قيّم تجربتك ⭐\n\n"
            "<b>📌 نصائح:</b>\n"
            "• حد الحجم: 50MB\n"
            "• 30 تحميل/ساعة\n"
            "• <b>اختر الجودة بحكمة:</b>\n"
            "  - الفيديوهات الطويلة → جودة أقل\n"
            "  - الفيديوهات القصيرة → جودة عالية"
        )
    else:
        text = "❓ خيار غير معروف"

    keyboard = [[InlineKeyboardButton("🔙 رجوع", callback_data="back_main")]]
    await query.edit_message_text(text, parse_mode=ParseMode.HTML,
                                    reply_markup=InlineKeyboardMarkup(keyboard))


# ================================================================
# 🆕 v4: نظام إعدادات yt-dlp المحسّن - يستخدم استراتيجية fallback
# ================================================================

def get_ytdlp_options_youtube(quality: str = "best", format_type: str = "video",
                                output_template: str = None, progress_hook=None,
                                client_strategy: str = "auto") -> dict:
    """
    إعدادات YouTube مع استراتيجيات متعددة
    client_strategy: 'auto' (default+ios+mweb) أو 'tv' (tv_simply) أو 'mobile' (ios)
    """
    if output_template is None:
        output_template = os.path.join(DOWNLOADS_DIR, f"{uuid.uuid4().hex}.%(ext)s")

    opts = {
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
        "compat_opts": {"allow-unsafe-ext"},
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
        },
    }

    if progress_hook:
        opts["progress_hooks"] = [progress_hook]

    # كوكيز إذا توفرت (الحل الأقوى)
    has_cookies = os.path.exists(YOUTUBE_COOKIES)
    if has_cookies:
        opts["cookiefile"] = YOUTUBE_COOKIES

    # === استراتيجيات الـ player_client ===
    if client_strategy == "tv":
        # tv_simply يحتاج EJS لكنه يتجاوز bot detection
        opts["extractor_args"] = {
            "youtube": {
                "player_client": ["tv_simply"],
                "formats": ["missing_pot"],  # 🆕 السماح بصيغ بدون PO Token
            }
        }
    elif client_strategy == "mobile":
        # iOS و Android - الأنسب للسيرفرات
        opts["extractor_args"] = {
            "youtube": {
                "player_client": ["ios", "android_vr", "mweb"],
                "formats": ["missing_pot"],
            }
        }
    else:  # auto - الترتيب الأفضل
        if has_cookies:
            # مع الكوكيز، استخدم default + web
            opts["extractor_args"] = {
                "youtube": {
                    "player_client": ["default", "web", "ios", "mweb"],
                    "formats": ["missing_pot"],
                }
            }
        else:
            # بدون كوكيز، استخدم clients التي لا تحتاج PO Token
            opts["extractor_args"] = {
                "youtube": {
                    "player_client": ["ios", "mweb", "android_vr", "tv_simply"],
                    "formats": ["missing_pot"],
                }
            }

    # === الصيغ - مهم جداً! ===
    # 🆕 v4: نستخدم single-file formats أولاً (لا يحتاج دمج = أسرع)
    # ثم fallback إلى formats مع دمج إذا لم يجد
    if format_type == "audio":
        opts.update({
            "format": "bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
        })
    else:
        # ✅ الإصلاح الجذري: استخدام best (single file) أولاً ثم fallback
        if quality == "best":
            opts["format"] = (
                # أولاً: ملف واحد (بدون دمج = أسرع، لا timeout)
                "best[height<=720][filesize<50M][ext=mp4]/"
                "best[height<=480][filesize<50M][ext=mp4]/"
                "best[height<=720][ext=mp4]/"
                "best[ext=mp4][filesize<50M]/"
                # ثم: video+audio combined
                "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/"
                "best[height<=720]/best"
            )
        elif quality == "low":
            opts["format"] = (
                "worst[height>=240][ext=mp4]/worst[ext=mp4]/"
                "worstvideo[ext=mp4]+worstaudio/worst"
            )
        elif quality == "medium":
            opts["format"] = (
                "best[height<=480][filesize<50M][ext=mp4]/"
                "best[height<=480][ext=mp4]/"
                "best[height<=480]/"
                "bestvideo[height<=480]+bestaudio/best[height<=480]"
            )
        elif quality == "high":
            opts["format"] = (
                "best[height<=720][filesize<50M][ext=mp4]/"
                "best[height<=720][ext=mp4]/"
                "best[height<=720]/"
                "bestvideo[height<=720]+bestaudio/best[height<=720]"
            )

    return opts


def get_ytdlp_options_tiktok(quality: str = "best", format_type: str = "video",
                               output_template: str = None, progress_hook=None) -> dict:
    """
    إعدادات TikTok مع تحميل بدون علامة مائية
    """
    if output_template is None:
        output_template = os.path.join(DOWNLOADS_DIR, f"{uuid.uuid4().hex}.%(ext)s")

    opts = {
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "max_filesize": MAX_FILE_SIZE_BYTES * 3,
        "socket_timeout": 30,
        "retries": 3,
        "compat_opts": {"allow-unsafe-ext"},
        "http_headers": {
            "User-Agent": "com.zhiliaoapp.musically/2022600040 (Linux; U; Android 7.1.2; en_US; SM-G977N; Build/LMY48Z;tt-ok/3.12.13.1)",
        },
    }

    if progress_hook:
        opts["progress_hooks"] = [progress_hook]

    if os.path.exists(TIKTOK_COOKIES):
        opts["cookiefile"] = TIKTOK_COOKIES

    # ✅ الإصلاح الجذري: TikTok بدون علامة مائية
    # في yt-dlp، الصيغة "download" هي بدون علامة مائية (no_watermark)
    # و "play" هي مع علامة مائية
    if format_type == "audio":
        opts.update({
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
        })
    else:
        # 🎯 الترتيب: download (no watermark) > h264 > غير ذلك
        # format_id "download" أو "download_hd" = بدون علامة
        # format_id "play" أو "play_h264" = بمعالم
        opts["format"] = (
            # أفضل صيغة: بدون علامة مائية
            "download_hd/download/"
            # احتياطي: أي صيغة h264 (تُسمى play_h264 لكن قد تكون بلا علامة)
            "best[vcodec*=h264][ext=mp4]/"
            "best[ext=mp4]/"
            "best"
        )

    return opts


def get_ytdlp_options_instagram(format_type: str = "video", output_template: str = None,
                                  progress_hook=None) -> dict:
    """إعدادات Instagram"""
    if output_template is None:
        output_template = os.path.join(DOWNLOADS_DIR, f"{uuid.uuid4().hex}.%(ext)s")

    opts = {
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "max_filesize": MAX_FILE_SIZE_BYTES * 3,
        "socket_timeout": 30,
        "retries": 3,
        "compat_opts": {"allow-unsafe-ext"},
        "http_headers": {
            "User-Agent": "Instagram 219.0.0.12.117 Android",
        },
    }

    if progress_hook:
        opts["progress_hooks"] = [progress_hook]

    if os.path.exists(INSTAGRAM_COOKIES):
        opts["cookiefile"] = INSTAGRAM_COOKIES

    if format_type == "audio":
        opts.update({
            "format": "bestaudio/best",
            "postprocessors": [{"key": "FFmpegExtractAudio",
                                 "preferredcodec": "mp3", "preferredquality": "192"}],
        })
    elif format_type == "photo":
        opts["format"] = "best"
    else:
        opts["format"] = "best[ext=mp4]/best"

    return opts


def get_ytdlp_options_facebook(format_type: str = "video", output_template: str = None,
                                 progress_hook=None) -> dict:
    """إعدادات Facebook"""
    if output_template is None:
        output_template = os.path.join(DOWNLOADS_DIR, f"{uuid.uuid4().hex}.%(ext)s")

    opts = {
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "max_filesize": MAX_FILE_SIZE_BYTES * 3,
        "socket_timeout": 30,
        "retries": 3,
        "compat_opts": {"allow-unsafe-ext"},
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
    }

    if progress_hook:
        opts["progress_hooks"] = [progress_hook]

    if os.path.exists(FACEBOOK_COOKIES):
        opts["cookiefile"] = FACEBOOK_COOKIES

    if format_type == "audio":
        opts.update({
            "format": "bestaudio/best",
            "postprocessors": [{"key": "FFmpegExtractAudio",
                                 "preferredcodec": "mp3", "preferredquality": "192"}],
        })
    else:
        # Facebook: نتجنب dash/hls التي تتطلب دمج
        opts["format"] = "best[ext=mp4]/best"

    return opts


def get_ytdlp_options_snapchat(format_type: str = "video", output_template: str = None,
                                 progress_hook=None) -> dict:
    """إعدادات Snapchat"""
    if output_template is None:
        output_template = os.path.join(DOWNLOADS_DIR, f"{uuid.uuid4().hex}.%(ext)s")

    opts = {
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "max_filesize": MAX_FILE_SIZE_BYTES * 3,
        "socket_timeout": 30,
        "retries": 3,
        "compat_opts": {"allow-unsafe-ext"},
        # Snapchat: format بسيط جداً
        "format": "best[ext=mp4]/best[ext=m4v]/best[ext=mov]/best",
    }

    if progress_hook:
        opts["progress_hooks"] = [progress_hook]

    if os.path.exists(SNAPCHAT_COOKIES):
        opts["cookiefile"] = SNAPCHAT_COOKIES

    if format_type == "audio":
        opts.update({
            "format": "bestaudio/best",
            "postprocessors": [{"key": "FFmpegExtractAudio",
                                 "preferredcodec": "mp3", "preferredquality": "192"}],
        })

    return opts


def get_ytdlp_options_generic(quality: str = "best", format_type: str = "video",
                                output_template: str = None, progress_hook=None) -> dict:
    """إعدادات عامة لباقي المواقع"""
    if output_template is None:
        output_template = os.path.join(DOWNLOADS_DIR, f"{uuid.uuid4().hex}.%(ext)s")

    opts = {
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "max_filesize": MAX_FILE_SIZE_BYTES * 3,
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 5,
        "compat_opts": {"allow-unsafe-ext"},
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
    }

    if progress_hook:
        opts["progress_hooks"] = [progress_hook]

    if format_type == "audio":
        opts.update({
            "format": "bestaudio/best",
            "postprocessors": [{"key": "FFmpegExtractAudio",
                                 "preferredcodec": "mp3", "preferredquality": "192"}],
        })
    elif format_type == "photo":
        opts["format"] = "best"
    else:
        # ✅ تجنب formats التي تحتاج دمج (تتسبب في timeout)
        if quality == "best":
            opts["format"] = "best[filesize<50M][ext=mp4]/best[ext=mp4]/best"
        elif quality == "low":
            opts["format"] = "worst[ext=mp4]/worst"
        elif quality == "medium":
            opts["format"] = "best[height<=480][ext=mp4]/best[height<=480]"
        elif quality == "high":
            opts["format"] = "best[height<=720][ext=mp4]/best[height<=720]"

    return opts


def get_options_for_url(url: str, format_type: str, quality: str,
                         output_template: str = None, progress_hook=None,
                         client_strategy: str = "auto") -> dict:
    """اختيار الإعدادات المناسبة حسب الموقع"""
    if is_youtube(url):
        return get_ytdlp_options_youtube(quality, format_type, output_template,
                                          progress_hook, client_strategy)
    elif is_tiktok(url):
        return get_ytdlp_options_tiktok(quality, format_type, output_template, progress_hook)
    elif is_instagram(url):
        return get_ytdlp_options_instagram(format_type, output_template, progress_hook)
    elif is_facebook(url):
        return get_ytdlp_options_facebook(format_type, output_template, progress_hook)
    elif is_snapchat(url):
        return get_ytdlp_options_snapchat(format_type, output_template, progress_hook)
    else:
        return get_ytdlp_options_generic(quality, format_type, output_template, progress_hook)


# ================== جلب المعلومات ==================

async def get_video_info(url: str) -> Optional[dict]:
    """جلب معلومات الفيديو دون تحميل"""
    try:
        opts = {
            "quiet": True, "no_warnings": True, "noplaylist": True,
            "socket_timeout": 30, "compat_opts": {"allow-unsafe-ext"},
        }
        if is_youtube(url):
            opts["extractor_args"] = {
                "youtube": {
                    "player_client": ["ios", "mweb", "android_vr"],
                    "formats": ["missing_pot"],
                }
            }
            if os.path.exists(YOUTUBE_COOKIES):
                opts["cookiefile"] = YOUTUBE_COOKIES

        loop = asyncio.get_event_loop()
        info = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: yt_dlp.YoutubeDL(opts).extract_info(url, download=False)),
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
                    f"[{'█' * 15}] 100%\n\n🔄 يتم تجهيز الملف..."
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


# ================== التحميل الرئيسي مع Fallback Strategy ==================

async def _try_download(url: str, opts: dict) -> Tuple[Optional[List[str]], Optional[dict], Optional[str], Optional[str]]:
    """محاولة تحميل واحدة"""
    try:
        loop = asyncio.get_event_loop()
        files_before = set(os.listdir(DOWNLOADS_DIR))

        def _download():
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                return info

        info = await asyncio.wait_for(
            loop.run_in_executor(None, _download),
            timeout=DOWNLOAD_TIMEOUT_SEC,
        )

        await asyncio.sleep(0.5)
        files_after = set(os.listdir(DOWNLOADS_DIR))
        new_files = files_after - files_before
        new_files = [f for f in new_files if not f.endswith((".part", ".tmp", ".ytdl"))]
        file_paths = sorted(
            [os.path.join(DOWNLOADS_DIR, f) for f in new_files],
            key=lambda p: os.path.getsize(p) if os.path.exists(p) else 0,
            reverse=True,
        )
        if not file_paths:
            return None, info, "لم يتم تحميل أي ملف", "No files"

        return file_paths, info, None, None

    except asyncio.TimeoutError:
        return None, None, "timeout", f"Timeout {DOWNLOAD_TIMEOUT_SEC}s"
    except yt_dlp.utils.DownloadError as e:
        return None, None, str(e), traceback.format_exc()
    except Exception as e:
        return None, None, str(e), traceback.format_exc()


async def download_media(url: str, format_type: str = "video", quality: str = "best",
                          progress_tracker: Optional[ProgressTracker] = None
                          ) -> Tuple[Optional[List[str]], Optional[dict], Optional[str], Optional[str]]:
    """
    🆕 v4: التحميل مع استراتيجية Fallback ذكية
    إذا فشل بـ client معين، يجرّب client آخر
    """
    progress_hook = progress_tracker.hook if progress_tracker else None

    # === للـ YouTube فقط: استراتيجية fallback ===
    if is_youtube(url):
        strategies = ["auto", "mobile", "tv"]  # ترتيب الأفضلية

        last_error = None
        last_details = None

        for strategy in strategies:
            opts = get_options_for_url(url, format_type, quality,
                                         progress_hook=progress_hook,
                                         client_strategy=strategy)
            logger.info(f"🔄 محاولة YouTube بـ strategy={strategy}")

            file_paths, info, error, details = await _try_download(url, opts)

            if file_paths:
                logger.info(f"✅ نجح بـ strategy={strategy}")
                return file_paths, info, None, None

            last_error = error
            last_details = details

            # إذا كان الخطأ بسبب timeout، لا تكمل محاولات أخرى
            if error and "timeout" in error.lower():
                break

            # إذا كان الخطأ format غير متوفر، جرّب strategy تالي
            if error and "format is not available" in error.lower():
                logger.info(f"⚠️ format error, trying next strategy...")
                continue

            # إذا كان bot detection، جرّب التالي
            if error and ("not a bot" in error.lower() or "Sign in" in error):
                logger.info(f"⚠️ bot detection, trying next strategy...")
                continue

            # خطأ آخر، اخرج
            break

        # كل المحاولات فشلت
        return None, None, _format_error(last_error or "كل المحاولات فشلت"), last_details

    else:
        # مواقع أخرى: محاولة واحدة
        opts = get_options_for_url(url, format_type, quality, progress_hook=progress_hook)
        file_paths, info, error, details = await _try_download(url, opts)
        if file_paths:
            return file_paths, info, None, None
        return None, None, _format_error(error or "فشل التحميل"), details


def _format_error(err: str) -> str:
    """تحويل رسائل الأخطاء لرسائل عربية واضحة"""
    err_lower = err.lower() if err else ""

    if "timeout" in err_lower:
        return (
            "⏱ <b>انتهت المهلة</b>\n\n"
            "💡 <b>الأسباب المحتملة:</b>\n"
            "• الموقع بطيء حالياً\n"
            "• الفيديو طويل جداً\n"
            "• الجودة عالية (تحتاج دمج)\n\n"
            "<b>الحلول:</b>\n"
            "• جرّب جودة أقل (480p أو 240p)\n"
            "• أو حمّل الصوت فقط 🎵"
        )

    if "Sign in to confirm" in err or "not a bot" in err_lower:
        return (
            "🤖 <b>YouTube حظر الخادم</b>\n\n"
            "💡 <b>الحلول:</b>\n"
            "• جرّب فيديو آخر\n"
            "• <b>الأهم:</b> أضف cookies.txt من المتصفح\n"
            "  راسل المطور لإضافتها"
        )

    if "format is not available" in err_lower or "requested format" in err_lower:
        return (
            "📹 <b>الجودة المطلوبة غير متوفرة</b>\n\n"
            "💡 <b>الحلول:</b>\n"
            "• جرّب جودة أقل (480p أو 240p)\n"
            "• حمّل الصوت فقط 🎵\n"
            "• <b>YouTube:</b> أضف cookies.txt للحل النهائي"
        )

    if "extracted extension" in err_lower and "unusual" in err_lower:
        return "📹 <b>صيغة فيديو غير مألوفة</b>\nجرّب جودة أخرى."

    if "Unsupported URL" in err:
        return "❌ هذا الموقع غير مدعوم"
    if "Private" in err or "private" in err_lower:
        return "🔒 هذا المحتوى خاص"
    if "Video unavailable" in err:
        return "⛔ الفيديو غير متاح أو محذوف"
    if "geo" in err_lower or "country" in err_lower:
        return "🌍 الفيديو محظور في منطقة الخادم"
    if "filesize" in err_lower:
        return "📦 الملف كبير جداً (الحد 50MB)"
    if "live" in err_lower and "stream" in err_lower:
        return "📡 لا يمكن تحميل البث المباشر"
    if "members" in err_lower or "premium" in err_lower:
        return "👑 محتوى مدفوع"
    if "no video formats" in err_lower:
        return "📭 <b>لا توجد صيغ فيديو</b>\nقد يكون المحتوى صور فقط (جرّب /photo)"
    if "rate limit" in err_lower or "429" in err_lower:
        return "🚫 الموقع حظرنا مؤقتاً. جرّب بعد دقائق."

    return f"❌ <code>{err[:200]}</code>"


# ================== معالج الروابط ==================

URL_PATTERN = re.compile(r"https?://[^\s]+")


async def handle_link(update, context):
    user = update.effective_user
    register_user(user)

    if is_user_banned(user.id):
        await update.message.reply_text("🚫 تم حظرك.")
        return

    text = update.message.text or ""
    urls = URL_PATTERN.findall(text)
    if not urls:
        return

    url = urls[0]
    platform = detect_platform(url) or "🌐 موقع آخر"

    allowed, remaining = check_rate_limit(user.id)
    if not allowed:
        await update.message.reply_html("⏳ <b>تجاوزت الحد!</b>\n30 تحميل/ساعة.")
        return

    context.user_data["pending_url"] = url
    context.user_data["pending_platform"] = platform

    keyboard = [
        [InlineKeyboardButton("📹 فيديو (تلقائي)", callback_data="dl_video_best")],
        [
            InlineKeyboardButton("📺 720p", callback_data="dl_video_high"),
            InlineKeyboardButton("📱 480p", callback_data="dl_video_medium"),
            InlineKeyboardButton("⚡ 240p", callback_data="dl_video_low"),
        ],
        [InlineKeyboardButton("🎵 صوت MP3", callback_data="dl_audio_best")],
    ]

    if is_likely_image_url(url):
        keyboard.insert(0, [InlineKeyboardButton("📸 صور فقط", callback_data="dl_photo_best")])

    keyboard.append([
        InlineKeyboardButton("ℹ️ معلومات", callback_data="dl_info_none"),
        InlineKeyboardButton("❌ إلغاء", callback_data="cancel"),
    ])

    extra_hint = ""
    if is_likely_image_url(url):
        extra_hint = "\n\n📸 <i>يدعم الصور أيضاً!</i>"

    # 💡 نصيحة مهمة للمستخدمين
    if is_youtube(url):
        extra_hint += "\n\n💡 <i>إذا فشل، جرّب جودة أقل</i>"

    await update.message.reply_html(
        f"🔗 <b>الرابط مكتشف!</b>\n\n"
        f"📡 المنصة: {platform}\n"
        f"⏳ المتبقي: {remaining}/30{extra_hint}\n\n"
        "اختر نوع التحميل:",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def handle_download_choice(update, context):
    query = update.callback_query
    user = query.from_user
    data = query.data
    parts = data.split("_")
    if len(parts) < 3:
        await query.edit_message_text("❌ خيار غير صحيح")
        return

    _, format_type, quality = parts[0], parts[1], parts[2]
    url = context.user_data.get("pending_url")
    platform = context.user_data.get("pending_platform", "🌐")

    if not url:
        await query.edit_message_text("❌ انتهت الصلاحية. أرسل الرابط مرة أخرى.")
        return

    # === عرض المعلومات ===
    if format_type == "info":
        await query.edit_message_text("⏳ جاري جلب المعلومات...")
        info = await get_video_info(url)
        if not info:
            context.user_data["error_url"] = url
            context.user_data["error_platform"] = platform
            context.user_data["error_msg"] = "فشل جلب المعلومات"
            context.user_data["error_details"] = "get_video_info returned None"
            keyboard = [[InlineKeyboardButton("📢 إبلاغ المطور",
                                                callback_data=f"report_info_{user.id}")]]
            await query.edit_message_text(
                "❌ <b>فشل جلب المعلومات</b>",
                parse_mode=ParseMode.HTML,
                reply_markup=InlineKeyboardMarkup(keyboard),
            )
            return

        title = info.get("title", "غير معروف")[:100]
        uploader = info.get("uploader", "غير معروف")
        duration = format_duration(info.get("duration"))
        view_count = info.get("view_count", 0)

        text = (
            f"ℹ️ <b>معلومات</b>\n\n📡 {platform}\n"
            f"📝 <b>{title}</b>\n👤 {uploader}\n⏱ {duration}\n"
        )
        if view_count:
            text += f"👁 {view_count:,}\n"

        keyboard = [[InlineKeyboardButton("📥 تحميل", callback_data="dl_video_best")]]
        await query.edit_message_text(text, parse_mode=ParseMode.HTML,
                                        reply_markup=InlineKeyboardMarkup(keyboard))
        return

    # === التحميل الفعلي ===
    await query.edit_message_text(
        f"⏳ <b>بدء التحميل من {platform}...</b>\n\n🔍 جاري الاتصال...",
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

    # === فشل ===
    if error or not file_paths:
        context.user_data["error_url"] = url
        context.user_data["error_platform"] = platform
        context.user_data["error_msg"] = error
        context.user_data["error_details"] = error_details or "Unknown"

        keyboard = []
        # اقتراحات بديلة ذكية
        if format_type == "video":
            if quality == "best" or quality == "high":
                keyboard.append([InlineKeyboardButton("⚡ جرّب 480p (أسرع)",
                                                        callback_data="dl_video_medium")])
                keyboard.append([InlineKeyboardButton("⚡⚡ جرّب 240p (أسرع جداً)",
                                                        callback_data="dl_video_low")])
            elif quality == "medium":
                keyboard.append([InlineKeyboardButton("⚡ جرّب 240p",
                                                        callback_data="dl_video_low")])
            keyboard.append([InlineKeyboardButton("🎵 جرّب الصوت فقط",
                                                    callback_data="dl_audio_best")])
            if is_likely_image_url(url):
                keyboard.append([InlineKeyboardButton("📸 جرّب الصور",
                                                        callback_data="dl_photo_best")])
        keyboard.append([InlineKeyboardButton("🔄 إعادة المحاولة",
                                                callback_data=f"dl_{format_type}_{quality}")])
        keyboard.append([InlineKeyboardButton("📢 إبلاغ المطور",
                                                callback_data=f"report_dl_{user.id}")])

        await query.edit_message_text(
            f"❌ <b>فشل التحميل</b>\n\n{error}",
            parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard),
        )
        log_download(user, platform, url, "", format_type, 0, "failed")
        return

    # === فلترة الملفات ===
    image_exts = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
    video_exts = {".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v", ".flv"}
    audio_exts = {".mp3", ".m4a", ".aac", ".ogg", ".wav", ".opus"}

    images = [f for f in file_paths if os.path.splitext(f)[1].lower() in image_exts]
    videos = [f for f in file_paths if os.path.splitext(f)[1].lower() in video_exts]
    audios = [f for f in file_paths if os.path.splitext(f)[1].lower() in audio_exts]
    others = [f for f in file_paths if f not in images and f not in videos and f not in audios]

    title = (info.get("title", "") if info else "")[:200]
    uploader = info.get("uploader", "") if info else ""
    duration = info.get("duration") if info else None

    success_count = 0
    total_size = 0
    download_id = None

    try:
        # === الصور ===
        if images:
            await query.edit_message_text(
                f"📤 <b>إرسال {len(images)} صورة...</b>",
                parse_mode=ParseMode.HTML,
            )
            for i in range(0, len(images), 10):
                batch = images[i:i+10]
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
                        cap = f"📡 {platform}\n📝 {title}\n🤖 @{context.bot.username}" if i == 0 else None
                        await context.bot.send_photo(
                            query.message.chat_id, f, caption=cap, parse_mode=ParseMode.HTML,
                        )
                else:
                    media = []
                    for j, img in enumerate(valid_imgs):
                        with open(img, "rb") as f:
                            cap = f"📡 {platform}\n📝 {title}\n🤖 @{context.bot.username}" if (i == 0 and j == 0) else None
                            media.append(InputMediaPhoto(media=f.read(), caption=cap, parse_mode=ParseMode.HTML))
                    await context.bot.send_media_group(query.message.chat_id, media)
                success_count += len(valid_imgs)

        # === الفيديوهات ===
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

        # === الصوت ===
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

        # === ملفات أخرى ===
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
                [InlineKeyboardButton("⚡ جرّب 240p", callback_data="dl_video_low")],
                [InlineKeyboardButton("🎵 جرّب الصوت فقط", callback_data="dl_audio_best")],
                [InlineKeyboardButton("📢 إبلاغ المطور", callback_data=f"report_dl_{user.id}")],
            ]
            context.user_data["error_msg"] = "كل الملفات أكبر من الحد المسموح (50MB)"
            context.user_data["error_details"] = "All files exceeded MAX_FILE_SIZE_BYTES"
            await query.edit_message_text(
                "⚠️ <b>الملف كبير جداً</b>\n\nجرّب جودة أقل أو الصوت فقط.",
                parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard),
            )
            log_download(user, platform, url, title, format_type, 0, "too_large")
            return

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

        success_msg = f"✅ <b>تم الإرسال!</b>\n\n"
        if len(images) > 1:
            success_msg += f"📸 الصور: {success_count}\n"
        success_msg += f"📡 {platform}\n💾 {format_size(total_size)}\n\n🌟 <b>قيّم تجربتك:</b>"

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
            f"❌ <b>فشل الإرسال</b>\n\n{str(e)[:200]}",
            parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard),
        )
        log_download(user, platform, url, title, format_type, 0, "send_failed")
    finally:
        for path in file_paths:
            try:
                os.remove(path)
            except Exception:
                pass
        context.user_data.pop("pending_url", None)
        context.user_data.pop("pending_platform", None)


# ================== التقييم ==================

async def handle_rating(update, context):
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
            f"✅ <b>شكراً!</b>\n\n{stars} ({rating}/5)\n\n<i>تقييماتك تساعدنا 💙</i>",
            parse_mode=ParseMode.HTML,
        )
    except Exception as e:
        logger.error(f"rating error: {e}")
        await query.answer("❌ فشل", show_alert=True)


# ================== الإبلاغ عن الأخطاء ==================

async def handle_report_error(update, context):
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
                    InlineKeyboardButton("📋 تفاصيل", callback_data=f"err_details_{report_id}"),
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
                    err_path = os.path.join(ERROR_LOGS_DIR, f"error_{report_id}.txt")
                    with open(err_path, "w", encoding="utf-8") as f:
                        f.write(f"Report #{report_id}\nUser: {user.id} (@{user.username})\n")
                        f.write(f"URL: {url}\nPlatform: {platform}\nError: {error_msg}\n\n")
                        f.write("=" * 50 + "\nFull Traceback:\n")
                        f.write(error_details)
                    with open(err_path, "rb") as f:
                        await context.bot.send_document(
                            chat_id=OWNER_ID, document=f,
                            filename=f"error_{report_id}.txt",
                            caption=f"📋 #{report_id}",
                        )
            except Exception as e:
                logger.error(f"إرسال للمطور فشل: {e}")

        await query.edit_message_text(
            f"✅ <b>تم إرسال التقرير #{report_id}</b>\n\n<i>سيراجعه المطور 💙</i>",
            parse_mode=ParseMode.HTML,
        )
    except Exception as e:
        logger.exception("report error")
        await query.edit_message_text(f"❌ فشل: {str(e)[:100]}")


async def handle_error_action(update, context):
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
            await query.answer("❌ غير موجود", show_alert=True)
            return

        if action == "details":
            details = report["error_details"][:3500] if report["error_details"] else "لا توجد"
            await query.message.reply_html(f"📋 <b>#{report_id}</b>\n\n<code>{details}</code>")
            await query.answer()
        elif action == "resolve":
            with get_db() as conn:
                conn.execute("UPDATE error_reports SET status = 'resolved' WHERE id = ?", (report_id,))
            await query.answer("✅ تم", show_alert=True)
            try:
                await context.bot.send_message(
                    chat_id=report["user_id"],
                    text=f"✅ <b>تم حل المشكلة!</b>\n\nتقريرك #{report_id} عولج.",
                    parse_mode=ParseMode.HTML,
                )
            except Exception:
                pass
        elif action == "reply":
            context.user_data["replying_to_report"] = report_id
            context.user_data["replying_to_user"] = report["user_id"]
            await query.message.reply_text(
                f"💬 أرسل ردك (للتقرير #{report_id})"
            )
    except Exception as e:
        logger.exception("error action")
        await query.answer(f"❌ {str(e)[:50]}", show_alert=True)


async def handle_owner_reply(update, context):
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
            text=f"💬 <b>رد المطور (#{report_id}):</b>\n\n{reply_text}",
            parse_mode=ParseMode.HTML,
        )
        await update.message.reply_text("✅ تم")
        context.user_data.pop("replying_to_report", None)
        context.user_data.pop("replying_to_user", None)
    except Exception as e:
        await update.message.reply_text(f"❌ {e}")


# ================== أوامر سريعة ==================

async def _quick_download(update, context, url, format_type):
    user = update.effective_user
    register_user(user)
    if is_user_banned(user.id):
        return
    allowed, _ = check_rate_limit(user.id)
    if not allowed:
        await update.message.reply_text("⏳ تجاوزت الحد!")
        return

    platform = detect_platform(url) or "🌐"
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
            await msg.edit_text("⚠️ كل الملفات كبيرة")
            return

        download_id = log_download(user, platform, url, title, format_type,
                                     total_sz/(1024*1024), "success")
        rating_kb = [[InlineKeyboardButton(f"{'⭐' * i}", callback_data=f"rate_{download_id}_{i}")
                      for i in range(1, 6)]]
        await msg.edit_text(f"✅ تم! ({success} ملف)\n\nقيّم:",
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
        await update.message.reply_text("❌ غير صالح")
        return
    await _quick_download(update, context, url, "audio")


async def cmd_video(update, context):
    if not context.args:
        await update.message.reply_text("⚠️ /video [رابط]")
        return
    url = context.args[0]
    if not URL_PATTERN.match(url):
        await update.message.reply_text("❌ غير صالح")
        return
    await _quick_download(update, context, url, "video")


async def cmd_photo(update, context):
    if not context.args:
        await update.message.reply_text("⚠️ /photo [رابط]")
        return
    url = context.args[0]
    if not URL_PATTERN.match(url):
        await update.message.reply_text("❌ غير صالح")
        return
    await _quick_download(update, context, url, "photo")


async def cmd_info(update, context):
    if not context.args:
        await update.message.reply_text("⚠️ /info [رابط]")
        return
    url = context.args[0]
    if not URL_PATTERN.match(url):
        await update.message.reply_text("❌ غير صالح")
        return
    msg = await update.message.reply_text("⏳ جاري...")
    info = await get_video_info(url)
    if not info:
        await msg.edit_text("❌ فشل")
        return
    platform = detect_platform(url) or "🌐"
    text = (
        f"ℹ️ <b>معلومات</b>\n\n📡 {platform}\n"
        f"📝 <b>{info.get('title', '?')[:100]}</b>\n"
        f"👤 {info.get('uploader', '?')}\n"
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
            """SELECT COUNT(*) as cnt FROM downloads WHERE user_id = ?
               AND status = 'success' AND downloaded_at > datetime('now', '-7 days')""",
            (user.id,)
        ).fetchone()
        avg = conn.execute(
            "SELECT AVG(rating) as avg FROM downloads WHERE user_id = ? AND rating > 0",
            (user.id,)
        ).fetchone()

    if not user_data:
        await update.message.reply_text("📭 ابدأ بالتحميل!")
        return

    text = (
        f"📊 <b>إحصائياتك</b>\n\n"
        f"📥 الإجمالي: <b>{user_data['downloads_count']}</b>\n"
        f"📅 آخر 7 أيام: <b>{recent['cnt']}</b>\n"
    )
    if avg and avg["avg"]:
        text += f"⭐ متوسط: <b>{avg['avg']:.1f}/5</b>\n"
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
        pending = conn.execute(
            "SELECT COUNT(*) as c FROM error_reports WHERE status='pending'"
        ).fetchone()["c"]
        avg = conn.execute("SELECT AVG(rating) as avg FROM downloads WHERE rating > 0").fetchone()
        top = conn.execute(
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
    avg_v = avg["avg"] if avg and avg["avg"] else 0

    # إصدار yt-dlp الحالي
    ytdlp_version = yt_dlp.version.__version__

    text = (
        "🔐 <b>لوحة الإدارة</b>\n\n"
        f"👥 المستخدمين: <b>{total_users}</b>\n"
        f"🟢 نشطين اليوم: <b>{active}</b>\n"
        f"🚫 محظورين: <b>{banned}</b>\n\n"
        f"📥 الإجمالي: <b>{total_dl:,}</b>\n"
        f"📅 اليوم: <b>{today_dl}</b>\n"
        f"⭐ متوسط: <b>{avg_v:.2f}/5</b>\n\n"
        f"🚨 تقارير معلّقة: <b>{pending}</b>\n\n"
        f"💾 DB: <b>{db_size:.2f} MB</b>\n"
        f"💿 المساحة: <b>{free_mb:.0f}/{total_mb:.0f} MB</b>\n"
        f"🔧 yt-dlp: <code>{ytdlp_version}</code>\n"
    )
    if top:
        text += "\n<b>🏆 المنصات:</b>\n"
        for p in top:
            text += f"• {p['platform']} — {p['cnt']:,}\n"
    text += (
        "\n<b>الأوامر:</b>\n"
        "<code>/errors</code> /<code>/setcookies</code>\n"
        "<code>/update</code> - تحديث yt-dlp\n"
        "<code>/broadcast</code> /<code>/ban</code>\n"
        "<code>/cleanup</code>"
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
        await update.message.reply_text("📭 لا توجد")
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
        "🍪 <b>إعداد الكوكيز</b>\n\n"
        "أرسل ملف cookies.txt مع caption:\n\n"
        "• <code>youtube</code>\n• <code>instagram</code>\n"
        "• <code>facebook</code>\n• <code>tiktok</code>\n"
        "• <code>snapchat</code>\n\n"
        "<b>📥 الحصول على الكوكيز:</b>\n"
        "1. ثبّت <b>Get cookies.txt LOCALLY</b> على Chrome\n"
        "2. سجّل دخولك للموقع (في Incognito)\n"
        "3. اضغط الإضافة → Export\n"
        "4. أرسل الملف هنا\n\n"
        "📁 <b>الموجود:</b>\n"
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
        await update.message.reply_text("✅ تم")
    except Exception as e:
        await update.message.reply_text(f"❌ {e}")


async def cmd_update(update, context):
    """🆕 تحديث yt-dlp يدوياً (مهم لإصلاحات YouTube)"""
    if update.effective_user.id != OWNER_ID:
        return
    msg = await update.message.reply_text("🔄 جاري تحديث yt-dlp...")
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                ["pip", "install", "-U", "--no-deps", "yt-dlp"],
                capture_output=True, text=True, timeout=120,
            )
        )
        if result.returncode == 0:
            # إعادة تحميل yt_dlp
            import importlib
            importlib.reload(yt_dlp)
            await msg.edit_text(
                f"✅ <b>تم التحديث!</b>\n\n"
                f"الإصدار: <code>{yt_dlp.version.__version__}</code>\n\n"
                f"⚠️ أعد تشغيل البوت ليعمل الإصدار الجديد بشكل كامل.",
                parse_mode=ParseMode.HTML,
            )
        else:
            await msg.edit_text(f"❌ فشل:\n<code>{result.stderr[:500]}</code>",
                                 parse_mode=ParseMode.HTML)
    except Exception as e:
        await msg.edit_text(f"❌ {e}")


async def cmd_broadcast(update, context):
    if update.effective_user.id != OWNER_ID:
        return
    if not context.args:
        await update.message.reply_text("⚠️ /broadcast [نص]")
        return
    msg = " ".join(context.args)
    with get_db() as conn:
        users = conn.execute("SELECT user_id FROM users WHERE is_banned=0").fetchall()
    status = await update.message.reply_text(f"📤 لـ {len(users)} مستخدم...")
    sent = failed = 0
    for u in users:
        try:
            await context.bot.send_message(u["user_id"], msg, parse_mode=ParseMode.HTML)
            sent += 1
            await asyncio.sleep(0.05)
        except Exception:
            failed += 1
    await status.edit_text(f"✅ {sent} | ❌ {failed}")


async def cmd_ban_user(update, context):
    if update.effective_user.id != OWNER_ID:
        return
    if not context.args:
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
    await update.message.reply_text(f"🧹 ملفات: {len(os.listdir(DOWNLOADS_DIR))}")


# ================== ويب سيرفر ==================

async def health_check(request):
    return web.json_response({
        "status": "alive", "bot": "v4",
        "yt_dlp_version": yt_dlp.version.__version__,
    })


async def start_web_server():
    app = web.Application()
    app.router.add_get("/", health_check)
    app.router.add_get("/health", health_check)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info(f"🌐 على المنفذ {PORT}")


async def periodic_cleanup(context):
    cleanup_old_files()


# 🆕 تحديث yt-dlp تلقائياً كل 6 ساعات
async def periodic_ytdlp_update(context):
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, update_yt_dlp)
    except Exception as e:
        logger.error(f"auto-update error: {e}")


# ================== التشغيل ==================

async def setup_commands(application):
    commands = [
        BotCommand("start", "🚀 بدء"),
        BotCommand("help", "📚 المساعدة"),
        BotCommand("audio", "🎵 صوت"),
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
    # 🆕 تحديث yt-dlp تلقائياً كل 6 ساعات
    application.job_queue.run_repeating(periodic_ytdlp_update, interval=21600, first=21600)
    logger.info("✅ v4 جاهز!")
    logger.info(f"🔧 yt-dlp: {yt_dlp.version.__version__}")


def main():
    if not BOT_TOKEN:
        logger.error("❌ BOT_TOKEN غير معرّف!")
        return

    # 🆕 تحديث yt-dlp عند بدء التشغيل
    update_yt_dlp()

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
    application.add_handler(CommandHandler("update", cmd_update))
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

    logger.info("🚀 v4 يبدأ...")
    application.run_polling(drop_pending_updates=True, allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
