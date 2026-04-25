"""
🎬 بوت تحميل الفيديوهات من جميع مواقع التواصل الاجتماعي
=========================================================
يدعم: YouTube, TikTok, Instagram, Twitter/X, Facebook,
      Snapchat, Pinterest, Reddit, SoundCloud, Twitch
      وأكثر من 1000 موقع آخر!

الاستضافة: Render.com مع Persistent Disk
المكتبة الأساسية: yt-dlp (الأقوى عالمياً)
"""

import os
import re
import logging
import asyncio
import sqlite3
import shutil
import uuid
import time
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
    InputFile,
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

# مجلد التخزين الدائم
DATA_DIR = os.getenv("DATA_DIR", "/var/data")
DOWNLOADS_DIR = os.path.join(DATA_DIR, "downloads")
DB_PATH = os.path.join(DATA_DIR, "downloader.db")

# الحد الأقصى لحجم الملف (تيليجرام يقبل 50MB كحد أقصى للبوت العادي)
# مع Local Bot API Server يمكن رفع 2GB لكن نلتزم بالقياسي
MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# مدة الاحتفاظ بالملفات المؤقتة (دقيقة)
TEMP_FILE_LIFETIME_MIN = 10

# إنشاء المجلدات
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# ================== التسجيل ==================
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
# تقليل ضوضاء yt-dlp
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


# ================== قاعدة البيانات ==================

@contextmanager
def get_db():
    """مدير اتصال قاعدة البيانات"""
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

        # جدول إحصائيات التحميلات
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
                downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # جدول المستخدمين
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

        # جدول إعدادات المستخدم
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                default_quality TEXT DEFAULT 'best',
                default_format TEXT DEFAULT 'video',
                language TEXT DEFAULT 'ar'
            )
        """)

        # جدول حدود الاستخدام (لمنع السبام)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS rate_limits (
                user_id INTEGER PRIMARY KEY,
                count INTEGER DEFAULT 0,
                reset_at TIMESTAMP
            )
        """)

        cur.execute("CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_downloads_platform ON downloads(platform)")

        logger.info("✅ تم تهيئة قاعدة البيانات")


# ================== الدوال المساعدة ==================

def register_user(user):
    """تسجيل مستخدم جديد"""
    try:
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO users (user_id, username, first_name)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    username = excluded.username,
                    first_name = excluded.first_name,
                    last_active = CURRENT_TIMESTAMP
                """,
                (user.id, user.username or "", user.first_name or ""),
            )
            conn.execute(
                "INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)",
                (user.id,),
            )
    except Exception as e:
        logger.error(f"register_user error: {e}")


def is_user_banned(user_id: int) -> bool:
    """التحقق من حظر المستخدم"""
    try:
        with get_db() as conn:
            row = conn.execute(
                "SELECT is_banned FROM users WHERE user_id = ?", (user_id,)
            ).fetchone()
            return row and row["is_banned"] == 1
    except Exception:
        return False


def check_rate_limit(user_id: int, max_per_hour: int = 30) -> Tuple[bool, int]:
    """
    فحص حد الاستخدام (30 تحميل في الساعة افتراضياً)
    Returns: (allowed, remaining)
    """
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
                # إعادة تعيين العداد
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


def log_download(user, platform, url, title, file_type, size_mb, status):
    """تسجيل عملية التحميل"""
    try:
        with get_db() as conn:
            conn.execute(
                """INSERT INTO downloads (user_id, username, platform, url, title, file_type, file_size_mb, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (user.id, user.username or "", platform, url, title, file_type, size_mb, status),
            )
            if status == "success":
                conn.execute(
                    "UPDATE users SET downloads_count = downloads_count + 1 WHERE user_id = ?",
                    (user.id,),
                )
    except Exception as e:
        logger.error(f"log_download error: {e}")


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


def format_size(bytes_size: int) -> str:
    """تحويل الحجم إلى تنسيق مقروء"""
    for unit in ["B", "KB", "MB", "GB"]:
        if bytes_size < 1024:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024
    return f"{bytes_size:.1f} TB"


def format_duration(seconds: Optional[int]) -> str:
    """تحويل المدة إلى تنسيق مقروء"""
    if not seconds:
        return "N/A"
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


# ================== أوامر البداية ==================

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """أمر البداية"""
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
        "🎮 Twitch  •  🎬 Vimeo  •  + أكثر من 1000 موقع\n\n"
        "<b>📥 الاستخدام بسيط جداً:</b>\n"
        "فقط أرسل لي رابط الفيديو أو الصورة وسأحمّله لك فوراً!\n\n"
        "<b>🎯 المميزات:</b>\n"
        "• تحميل فيديو بأعلى جودة 📹\n"
        "• استخراج الصوت MP3 🎵\n"
        "• تحميل الصور والقصص 📸\n"
        "• اختيار جودة معينة 🎚️\n"
        "• كتابة وتعليقات الفيديو 📝\n\n"
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
    """عرض المساعدة"""
    text = (
        "📚 <b>الأوامر المتاحة</b>\n\n"
        "<b>🎬 التحميل:</b>\n"
        "فقط أرسل أي رابط وسأحمّله!\n\n"
        "<b>🔧 الأوامر:</b>\n"
        "<code>/start</code> - القائمة الرئيسية\n"
        "<code>/help</code> - هذه الرسالة\n"
        "<code>/audio [رابط]</code> - تحميل صوت MP3 فقط\n"
        "<code>/video [رابط]</code> - تحميل فيديو\n"
        "<code>/info [رابط]</code> - معلومات الفيديو دون تحميل\n"
        "<code>/quality</code> - تغيير الجودة الافتراضية\n"
        "<code>/stats</code> - إحصائياتك الشخصية\n"
        "<code>/platforms</code> - قائمة المنصات المدعومة\n\n"
        "<b>📊 للمالك فقط:</b>\n"
        "<code>/admin</code> - لوحة الإدارة\n"
        "<code>/broadcast [رسالة]</code> - بث للجميع\n"
        "<code>/ban [user_id]</code> - حظر مستخدم\n"
        "<code>/unban [user_id]</code> - إلغاء حظر\n\n"
        "💡 <b>أمثلة:</b>\n"
        "<code>/audio https://youtu.be/xxx</code>\n"
        "<code>/info https://tiktok.com/xxx</code>"
    )
    await update.message.reply_html(text)


async def cmd_platforms(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """عرض المنصات المدعومة"""
    seen = set()
    text = "🌐 <b>المنصات المدعومة (الرئيسية):</b>\n\n"
    for name in SUPPORTED_PLATFORMS.values():
        if name not in seen:
            text += f"• {name}\n"
            seen.add(name)
    text += (
        "\n💡 <b>+ أكثر من 1000 موقع آخر!</b>\n"
        "إذا كان الموقع لديك ليس في القائمة، جرّب إرسال الرابط - "
        "البوت يستخدم yt-dlp الذي يدعم آلاف المواقع."
    )
    await update.message.reply_html(text)


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معالج أزرار الواجهة"""
    query = update.callback_query
    await query.answer()
    data = query.data

    if data == "back_main":
        await cmd_start(update, context)
        return

    if data == "help_cmds":
        text = (
            "📚 <b>الأوامر</b>\n\n"
            "<b>للتحميل:</b>\n"
            "• فقط أرسل أي رابط\n"
            "• <code>/audio [رابط]</code> - صوت MP3\n"
            "• <code>/video [رابط]</code> - فيديو\n"
            "• <code>/info [رابط]</code> - معلومات فقط\n\n"
            "<b>إعدادات:</b>\n"
            "• <code>/quality</code> - تغيير الجودة\n"
            "• <code>/stats</code> - إحصائياتك"
        )
    elif data == "help_platforms":
        seen = set()
        platforms_text = ""
        for name in SUPPORTED_PLATFORMS.values():
            if name not in seen:
                platforms_text += f"• {name}\n"
                seen.add(name)
        text = (
            "🌐 <b>المنصات المدعومة:</b>\n\n"
            f"{platforms_text}\n"
            "💡 <b>+ 1000 موقع آخر!</b>"
        )
    elif data == "settings":
        with get_db() as conn:
            settings = conn.execute(
                "SELECT * FROM user_settings WHERE user_id = ?",
                (query.from_user.id,),
            ).fetchone()

        quality = settings["default_quality"] if settings else "best"
        text = (
            "⚙️ <b>إعداداتك الحالية:</b>\n\n"
            f"🎚️ الجودة الافتراضية: <b>{quality}</b>\n\n"
            "استخدم <code>/quality</code> لتغيير الجودة"
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

        downloads = user_data["downloads_count"] if user_data else 0
        joined = user_data["joined_at"][:10] if user_data else "غير معروف"

        text = (
            "📊 <b>إحصائياتك:</b>\n\n"
            f"📥 إجمالي التحميلات: <b>{downloads}</b>\n"
            f"📅 تاريخ الانضمام: <b>{joined}</b>\n\n"
        )
        if top_platforms:
            text += "<b>🔥 أكثر منصاتك استخداماً:</b>\n"
            for p in top_platforms:
                text += f"• {p['platform']} — {p['cnt']} تحميل\n"
    elif data == "how_it_works":
        text = (
            "ℹ️ <b>كيف يعمل البوت؟</b>\n\n"
            "1️⃣ <b>أرسل الرابط</b>\n"
            "انسخ رابط الفيديو/الصورة من أي تطبيق وأرسله للبوت\n\n"
            "2️⃣ <b>اختر الجودة</b>\n"
            "ستظهر لك أزرار لاختيار: فيديو/صوت/جودة معينة\n\n"
            "3️⃣ <b>تحميل تلقائي</b>\n"
            "البوت يحمّل الملف ويرسله لك في ثوانٍ\n\n"
            "<b>⚡ نصائح:</b>\n"
            "• الحد الأقصى لحجم الملف: 50 MB (تحديد تيليجرام)\n"
            "• تستطيع تحميل 30 ملف في الساعة\n"
            "• الفيديوهات الكبيرة سيعرض البوت رابط مباشر\n"
            "• الملفات تُحذف من خوادمنا فوراً بعد الإرسال"
        )
    elif data.startswith("dl_"):
        await handle_download_choice(update, context)
        return
    elif data == "cancel":
        await query.edit_message_text("❌ تم الإلغاء.")
        return
    else:
        text = "❓ خيار غير معروف"

    keyboard = [[InlineKeyboardButton("🔙 رجوع", callback_data="back_main")]]
    await query.edit_message_text(
        text, parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ================== التحميل الأساسي ==================

def get_ytdlp_options(format_type: str = "video", quality: str = "best",
                     output_template: str = None) -> dict:
    """إعدادات yt-dlp حسب نوع التحميل"""
    if output_template is None:
        output_template = os.path.join(DOWNLOADS_DIR, f"{uuid.uuid4().hex[:12]}_%(title).80s.%(ext)s")

    common = {
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": False,
        "max_filesize": MAX_FILE_SIZE_BYTES * 2,  # نحاول التحميل ثم نتحقق
        "socket_timeout": 60,
        "retries": 3,
        "fragment_retries": 3,
        # إضافة هيدرز عشوائية لتجنب الحظر
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
    }

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
        if quality == "best":
            common["format"] = "best[filesize<50M]/best[height<=720]/best"
        elif quality == "low":
            common["format"] = "worst[height>=240]/worst"
        elif quality == "medium":
            common["format"] = "best[height<=480]/best"
        elif quality == "high":
            common["format"] = "best[height<=720]/best"
        else:
            common["format"] = quality  # custom format

    return common


async def get_video_info(url: str) -> Optional[dict]:
    """جلب معلومات الفيديو دون تحميل"""
    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(
            None,
            lambda: yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "noplaylist": True}).extract_info(url, download=False)
        )
        return info
    except Exception as e:
        logger.error(f"get_video_info error: {e}")
        return None


async def download_media(url: str, format_type: str = "video",
                          quality: str = "best") -> Tuple[Optional[str], Optional[dict], Optional[str]]:
    """
    تحميل الوسائط
    Returns: (file_path, info_dict, error_message)
    """
    try:
        opts = get_ytdlp_options(format_type, quality)
        loop = asyncio.get_event_loop()

        def _download():
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                # الحصول على المسار النهائي
                if "requested_downloads" in info and info["requested_downloads"]:
                    filepath = info["requested_downloads"][0]["filepath"]
                else:
                    filepath = ydl.prepare_filename(info)
                    # إذا تم تحويل لـ mp3
                    if format_type == "audio":
                        filepath = os.path.splitext(filepath)[0] + ".mp3"
                return filepath, info

        filepath, info = await loop.run_in_executor(None, _download)

        if not os.path.exists(filepath):
            return None, info, "الملف لم يُحفظ بشكل صحيح"

        return filepath, info, None

    except yt_dlp.utils.DownloadError as e:
        err = str(e)
        if "Unsupported URL" in err:
            return None, None, "❌ هذا الموقع غير مدعوم"
        elif "Private" in err or "private" in err:
            return None, None, "🔒 هذا المحتوى خاص"
        elif "Video unavailable" in err:
            return None, None, "⛔ الفيديو غير متاح"
        elif "filesize" in err.lower() or "too large" in err.lower():
            return None, None, "📦 الملف كبير جداً (الحد 50MB)"
        return None, None, f"❌ خطأ في التحميل: {err[:100]}"
    except Exception as e:
        logger.exception(f"download_media error")
        return None, None, f"❌ خطأ غير متوقع: {str(e)[:100]}"


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
    platform = detect_platform(url)

    if not platform:
        # نحاول التحميل على أي حال - yt-dlp يدعم مواقع كثيرة غير معروفة
        platform = "🌐 موقع آخر"

    # فحص حد الاستخدام
    allowed, remaining = check_rate_limit(user.id)
    if not allowed:
        await update.message.reply_html(
            "⏳ <b>تجاوزت الحد المسموح!</b>\n"
            "يمكنك تحميل 30 ملف في الساعة فقط.\n"
            "حاول مرة أخرى بعد ساعة."
        )
        return

    # حفظ الرابط في context للاستخدام لاحقاً
    context.user_data["pending_url"] = url
    context.user_data["pending_platform"] = platform

    keyboard = [
        [
            InlineKeyboardButton("📹 فيديو (أفضل جودة)", callback_data="dl_video_best"),
        ],
        [
            InlineKeyboardButton("📺 جودة عالية 720p", callback_data="dl_video_high"),
            InlineKeyboardButton("📱 جودة متوسطة 480p", callback_data="dl_video_medium"),
        ],
        [
            InlineKeyboardButton("🎵 صوت MP3 فقط", callback_data="dl_audio_best"),
        ],
        [
            InlineKeyboardButton("ℹ️ معلومات فقط", callback_data="dl_info_none"),
            InlineKeyboardButton("❌ إلغاء", callback_data="cancel"),
        ],
    ]

    await update.message.reply_html(
        f"🔗 <b>الرابط مكتشف!</b>\n\n"
        f"📡 المنصة: {platform}\n"
        f"⏳ المتبقي لك: {remaining}/30 تحميل\n\n"
        "اختر نوع التحميل:",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def handle_download_choice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معالج اختيار نوع التحميل"""
    query = update.callback_query
    user = query.from_user
    data = query.data  # dl_video_best, dl_audio_best, dl_info_none, etc.

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
            await query.edit_message_text("❌ فشل جلب المعلومات. الرابط قد يكون غير صالح.")
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

    # === التحميل الفعلي ===
    await query.edit_message_text(
        f"⏳ <b>جاري التحميل...</b>\n\n"
        f"📡 المنصة: {platform}\n"
        f"📦 النوع: {'صوت MP3' if format_type == 'audio' else 'فيديو'}\n"
        f"🎚 الجودة: {quality}\n\n"
        "⏱ قد يستغرق من 10 ثواني إلى دقيقة...",
        parse_mode=ParseMode.HTML,
    )

    # إرسال "يكتب..." للمستخدم
    await context.bot.send_chat_action(
        chat_id=query.message.chat_id,
        action=ChatAction.UPLOAD_VIDEO if format_type == "video" else ChatAction.UPLOAD_AUDIO,
    )

    filepath, info, error = await download_media(url, format_type, quality)

    if error or not filepath:
        await query.edit_message_text(f"❌ <b>فشل التحميل</b>\n\n{error or 'خطأ غير معروف'}",
                                       parse_mode=ParseMode.HTML)
        log_download(user, platform, url, "", format_type, 0, "failed")
        return

    # فحص حجم الملف
    file_size = os.path.getsize(filepath)
    file_size_mb = file_size / (1024 * 1024)

    if file_size > MAX_FILE_SIZE_BYTES:
        await query.edit_message_text(
            f"⚠️ <b>الملف كبير جداً</b>\n\n"
            f"حجم الملف: {file_size_mb:.1f} MB\n"
            f"الحد الأقصى: {MAX_FILE_SIZE_MB} MB\n\n"
            "💡 جرب جودة أقل أو حمّل الصوت فقط.",
            parse_mode=ParseMode.HTML,
        )
        try:
            os.remove(filepath)
        except Exception:
            pass
        log_download(user, platform, url, info.get("title", "") if info else "",
                    format_type, file_size_mb, "too_large")
        return

    # === الإرسال ===
    title = (info.get("title", "") if info else "")[:200]
    uploader = info.get("uploader", "") if info else ""
    duration = info.get("duration") if info else None

    caption = f"📡 <b>{platform}</b>\n"
    if title:
        caption += f"📝 {title}\n"
    if uploader:
        caption += f"👤 {uploader}\n"
    caption += f"\n💾 الحجم: {format_size(file_size)}"
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
                # تحديد نوع الإرسال (فيديو أو ملف)
                await context.bot.send_video(
                    chat_id=query.message.chat_id,
                    video=f,
                    caption=caption,
                    parse_mode=ParseMode.HTML,
                    duration=duration,
                    supports_streaming=True,
                )

        await query.edit_message_text(
            f"✅ <b>تم الإرسال بنجاح!</b>\n\n"
            f"📡 {platform}\n"
            f"💾 {format_size(file_size)}",
            parse_mode=ParseMode.HTML,
        )
        log_download(user, platform, url, title, format_type, file_size_mb, "success")

    except Exception as e:
        logger.exception("send error")
        await query.edit_message_text(f"❌ فشل الإرسال: {str(e)[:100]}")
        log_download(user, platform, url, title, format_type, file_size_mb, "send_failed")
    finally:
        # حذف الملف بعد الإرسال
        try:
            os.remove(filepath)
        except Exception:
            pass

        # تنظيف الذاكرة
        context.user_data.pop("pending_url", None)
        context.user_data.pop("pending_platform", None)


# ================== أوامر سريعة ==================

async def cmd_audio(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """أمر سريع لتحميل صوت MP3"""
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

    platform = detect_platform(url) or "🌐 موقع"
    msg = await update.message.reply_html(f"⏳ جاري تحميل الصوت من {platform}...")
    await context.bot.send_chat_action(update.effective_chat.id, ChatAction.UPLOAD_AUDIO)

    filepath, info, error = await download_media(url, "audio", "best")
    if error or not filepath:
        await msg.edit_text(f"❌ {error or 'فشل التحميل'}")
        log_download(user, platform, url, "", "audio", 0, "failed")
        return

    size = os.path.getsize(filepath)
    if size > MAX_FILE_SIZE_BYTES:
        await msg.edit_text(f"⚠️ الملف كبير جداً ({size/(1024*1024):.1f} MB)")
        os.remove(filepath)
        return

    title = (info.get("title", "") if info else "")[:200]
    try:
        with open(filepath, "rb") as f:
            await context.bot.send_audio(
                update.effective_chat.id, f,
                caption=f"🎵 {title}\n📡 {platform}\n🤖 @{context.bot.username}",
                title=title[:64] if title else None,
            )
        await msg.edit_text("✅ تم!")
        log_download(user, platform, url, title, "audio", size/(1024*1024), "success")
    except Exception as e:
        await msg.edit_text(f"❌ خطأ: {str(e)[:100]}")
    finally:
        try:
            os.remove(filepath)
        except Exception:
            pass


async def cmd_video(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """أمر سريع لتحميل الفيديو"""
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
    msg = await update.message.reply_html(f"⏳ جاري تحميل الفيديو من {platform}...")
    await context.bot.send_chat_action(update.effective_chat.id, ChatAction.UPLOAD_VIDEO)

    filepath, info, error = await download_media(url, "video", "best")
    if error or not filepath:
        await msg.edit_text(f"❌ {error or 'فشل التحميل'}")
        log_download(user, platform, url, "", "video", 0, "failed")
        return

    size = os.path.getsize(filepath)
    if size > MAX_FILE_SIZE_BYTES:
        await msg.edit_text(f"⚠️ الملف كبير جداً ({size/(1024*1024):.1f} MB)\nجرب /audio للصوت فقط")
        os.remove(filepath)
        return

    title = (info.get("title", "") if info else "")[:200]
    duration = info.get("duration") if info else None
    try:
        with open(filepath, "rb") as f:
            await context.bot.send_video(
                update.effective_chat.id, f,
                caption=f"📹 {title}\n📡 {platform}\n🤖 @{context.bot.username}",
                duration=duration,
                supports_streaming=True,
            )
        await msg.edit_text("✅ تم!")
        log_download(user, platform, url, title, "video", size/(1024*1024), "success")
    except Exception as e:
        await msg.edit_text(f"❌ خطأ: {str(e)[:100]}")
    finally:
        try:
            os.remove(filepath)
        except Exception:
            pass


async def cmd_info(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """عرض معلومات الفيديو دون تحميل"""
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
    title = info.get("title", "غير معروف")[:100]
    uploader = info.get("uploader", "غير معروف")
    duration = format_duration(info.get("duration"))
    views = info.get("view_count", 0)

    text = (
        f"ℹ️ <b>معلومات الفيديو</b>\n\n"
        f"📡 {platform}\n"
        f"📝 <b>{title}</b>\n"
        f"👤 {uploader}\n"
        f"⏱ {duration}\n"
    )
    if views:
        text += f"👁 {views:,} مشاهدة\n"

    await msg.edit_text(text, parse_mode=ParseMode.HTML)


async def cmd_quality(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """تغيير الجودة الافتراضية"""
    keyboard = [
        [
            InlineKeyboardButton("⚡ الأسرع (240p)", callback_data="setq_low"),
            InlineKeyboardButton("📱 متوسطة (480p)", callback_data="setq_medium"),
        ],
        [
            InlineKeyboardButton("📺 عالية (720p)", callback_data="setq_high"),
            InlineKeyboardButton("🌟 الأفضل", callback_data="setq_best"),
        ],
    ]
    await update.message.reply_html(
        "🎚 <b>اختر الجودة الافتراضية:</b>",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """إحصائيات المستخدم"""
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

    if not user_data:
        await update.message.reply_text("📭 لا توجد إحصائيات بعد. ابدأ بتحميل أول فيديو!")
        return

    text = (
        f"📊 <b>إحصائياتك الشخصية</b>\n\n"
        f"📥 إجمالي التحميلات: <b>{user_data['downloads_count']}</b>\n"
        f"📅 آخر 7 أيام: <b>{recent['cnt']}</b>\n"
        f"🗓 منذ: {user_data['joined_at'][:10]}\n"
    )
    if platforms:
        text += "\n<b>🏆 أكثر منصاتك:</b>\n"
        for p in platforms:
            text += f"• {p['platform']} — {p['cnt']}\n"

    await update.message.reply_html(text)


# ================== أوامر الإدارة ==================

async def cmd_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """لوحة الإدارة (للمالك)"""
    if update.effective_user.id != OWNER_ID:
        return

    with get_db() as conn:
        total_users = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
        total_downloads = conn.execute("SELECT COUNT(*) as c FROM downloads WHERE status='success'").fetchone()["c"]
        today_downloads = conn.execute(
            "SELECT COUNT(*) as c FROM downloads WHERE status='success' AND downloaded_at > datetime('now', '-1 day')"
        ).fetchone()["c"]
        active_today = conn.execute(
            "SELECT COUNT(*) as c FROM users WHERE last_active > datetime('now', '-1 day')"
        ).fetchone()["c"]
        banned = conn.execute("SELECT COUNT(*) as c FROM users WHERE is_banned=1").fetchone()["c"]
        top_platforms = conn.execute(
            """SELECT platform, COUNT(*) as cnt FROM downloads WHERE status='success'
               GROUP BY platform ORDER BY cnt DESC LIMIT 5"""
        ).fetchall()

    # حجم القرص
    try:
        statvfs = os.statvfs(DATA_DIR)
        free_mb = (statvfs.f_bavail * statvfs.f_frsize) / (1024 * 1024)
        total_mb = (statvfs.f_blocks * statvfs.f_frsize) / (1024 * 1024)
    except Exception:
        free_mb = total_mb = 0

    db_size = os.path.getsize(DB_PATH) / (1024 * 1024) if os.path.exists(DB_PATH) else 0

    text = (
        "🔐 <b>لوحة الإدارة</b>\n\n"
        f"👥 إجمالي المستخدمين: <b>{total_users}</b>\n"
        f"🟢 نشطين اليوم: <b>{active_today}</b>\n"
        f"🚫 محظورين: <b>{banned}</b>\n\n"
        f"📥 إجمالي التحميلات: <b>{total_downloads:,}</b>\n"
        f"📅 تحميلات اليوم: <b>{today_downloads}</b>\n\n"
        f"💾 حجم DB: <b>{db_size:.2f} MB</b>\n"
        f"💿 المساحة المتاحة: <b>{free_mb:.0f}/{total_mb:.0f} MB</b>\n"
    )
    if top_platforms:
        text += "\n<b>🏆 أكثر المنصات:</b>\n"
        for p in top_platforms:
            text += f"• {p['platform']} — {p['cnt']:,}\n"

    text += (
        "\n<b>أوامر الإدارة:</b>\n"
        "<code>/broadcast [رسالة]</code> - بث للجميع\n"
        "<code>/ban [user_id]</code> - حظر\n"
        "<code>/unban [user_id]</code> - إلغاء حظر\n"
        "<code>/cleanup</code> - تنظيف الملفات المؤقتة"
    )
    await update.message.reply_html(text)


async def cmd_broadcast(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """بث رسالة لجميع المستخدمين (للمالك)"""
    if update.effective_user.id != OWNER_ID:
        return

    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /broadcast [الرسالة]")
        return

    msg = " ".join(context.args)
    with get_db() as conn:
        users = conn.execute("SELECT user_id FROM users WHERE is_banned=0").fetchall()

    status = await update.message.reply_text(f"📤 جاري البث لـ {len(users)} مستخدم...")
    sent = failed = 0
    for u in users:
        try:
            await context.bot.send_message(u["user_id"], msg, parse_mode=ParseMode.HTML)
            sent += 1
            await asyncio.sleep(0.05)  # تجنب rate limit
        except Exception:
            failed += 1

    await status.edit_text(f"✅ تم البث!\n📤 ناجحة: {sent}\n❌ فاشلة: {failed}")


async def cmd_ban_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """حظر مستخدم"""
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
    """إلغاء حظر مستخدم"""
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
    """تنظيف الملفات المؤقتة"""
    if update.effective_user.id != OWNER_ID:
        return
    cleanup_old_files()
    files = os.listdir(DOWNLOADS_DIR)
    await update.message.reply_text(f"🧹 تم التنظيف. الملفات المتبقية: {len(files)}")


# ================== ويب سيرفر ==================

async def health_check(request):
    """نقطة فحص صحة البوت"""
    return web.json_response({
        "status": "alive",
        "bot": "media downloader",
        "supported_platforms": len(set(SUPPORTED_PLATFORMS.values())),
    })


async def start_web_server():
    """تشغيل خادم الويب"""
    app = web.Application()
    app.router.add_get("/", health_check)
    app.router.add_get("/health", health_check)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info(f"🌐 الخادم على المنفذ {PORT}")


# ================== تنظيف دوري ==================

async def periodic_cleanup(context: ContextTypes.DEFAULT_TYPE):
    """مهمة دورية لتنظيف الملفات القديمة"""
    cleanup_old_files()


# ================== التشغيل ==================

async def setup_commands(application: Application):
    """تعيين قائمة الأوامر"""
    commands = [
        BotCommand("start", "🚀 بدء البوت"),
        BotCommand("help", "📚 المساعدة"),
        BotCommand("audio", "🎵 تحميل صوت MP3"),
        BotCommand("video", "📹 تحميل فيديو"),
        BotCommand("info", "ℹ️ معلومات الفيديو"),
        BotCommand("platforms", "🌐 المنصات المدعومة"),
        BotCommand("stats", "📊 إحصائياتي"),
        BotCommand("quality", "🎚 تغيير الجودة"),
    ]
    await application.bot.set_my_commands(commands)


async def post_init(application: Application):
    """ما بعد التهيئة"""
    await setup_commands(application)
    await start_web_server()

    # جدولة تنظيف دوري كل 10 دقائق
    application.job_queue.run_repeating(periodic_cleanup, interval=600, first=600)

    logger.info("✅ البوت جاهز ويعمل!")
    logger.info(f"💾 مسار قاعدة البيانات: {DB_PATH}")
    logger.info(f"📥 مجلد التحميلات: {DOWNLOADS_DIR}")


def main():
    """نقطة البداية"""
    if not BOT_TOKEN:
        logger.error("❌ BOT_TOKEN غير معرّف!")
        return

    init_database()

    application = Application.builder().token(BOT_TOKEN).post_init(post_init).build()

    # === الأوامر ===
    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("help", cmd_help))
    application.add_handler(CommandHandler("audio", cmd_audio))
    application.add_handler(CommandHandler("video", cmd_video))
    application.add_handler(CommandHandler("info", cmd_info))
    application.add_handler(CommandHandler("platforms", cmd_platforms))
    application.add_handler(CommandHandler("quality", cmd_quality))
    application.add_handler(CommandHandler("stats", cmd_stats))

    # === الإدارة ===
    application.add_handler(CommandHandler("admin", cmd_admin))
    application.add_handler(CommandHandler("broadcast", cmd_broadcast))
    application.add_handler(CommandHandler("ban", cmd_ban_user))
    application.add_handler(CommandHandler("unban", cmd_unban_user))
    application.add_handler(CommandHandler("cleanup", cmd_cleanup))

    # === الأزرار ===
    application.add_handler(CallbackQueryHandler(callback_handler))

    # === معالج الروابط (أهم شيء!) ===
    application.add_handler(
        MessageHandler(
            filters.TEXT & ~filters.COMMAND & filters.Regex(URL_PATTERN),
            handle_link,
        )
    )

    logger.info("🚀 البوت يبدأ العمل...")
    application.run_polling(drop_pending_updates=True, allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
