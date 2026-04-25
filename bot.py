"""
🎬 بوت تحميل الوسائط من جميع مواقع التواصل الاجتماعي
=========================================================
الإصدار: 2.1 - محسّن (دعم صور، تخطي حظر، إصلاح الجودات)
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

YOUTUBE_COOKIES = os.path.join(COOKIES_DIR, "youtube.txt")
INSTAGRAM_COOKIES = os.path.join(COOKIES_DIR, "instagram.txt")
FACEBOOK_COOKIES = os.path.join(COOKIES_DIR, "facebook.txt")
TIKTOK_COOKIES = os.path.join(COOKIES_DIR, "tiktok.txt")

MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
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
        logger.info("✅ تم تهيئة قاعدة البيانات")

# ================== الدوال المساعدة ==================
def register_user(user):
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
    except Exception as e:
        pass

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
                conn.execute("INSERT INTO rate_limits (user_id, count, reset_at) VALUES (?, 1, datetime('now', '+1 hour'))", (user_id,))
                return True, max_per_hour - 1
            reset_at = datetime.fromisoformat(row["reset_at"])
            if now >= reset_at:
                conn.execute("UPDATE rate_limits SET count = 1, reset_at = datetime('now', '+1 hour') WHERE user_id = ?", (user_id,))
                return True, max_per_hour - 1
            if row["count"] >= max_per_hour:
                return False, 0
            conn.execute("UPDATE rate_limits SET count = count + 1 WHERE user_id = ?", (user_id,))
            return True, max_per_hour - row["count"] - 1
    except Exception:
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
    except Exception:
        return None

def cleanup_old_files():
    try:
        now = time.time()
        for f in os.listdir(DOWNLOADS_DIR):
            path = os.path.join(DOWNLOADS_DIR, f)
            if os.path.isfile(path):
                if (now - os.path.getmtime(path)) / 60 > TEMP_FILE_LIFETIME_MIN:
                    os.remove(path)
    except Exception:
        pass

def format_size(bytes_size) -> str:
    if not bytes_size: return "0 B"
    bytes_size = float(bytes_size)
    for unit in ["B", "KB", "MB", "GB"]:
        if bytes_size < 1024: return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024
    return f"{bytes_size:.1f} TB"

def format_duration(seconds: Optional[int]) -> str:
    if not seconds: return "N/A"
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
        [InlineKeyboardButton("📚 الأوامر", callback_data="help_cmds"), InlineKeyboardButton("🌐 المنصات المدعومة", callback_data="help_platforms")],
        [InlineKeyboardButton("⚙️ الإعدادات", callback_data="settings"), InlineKeyboardButton("📊 إحصائياتي", callback_data="my_stats")],
        [InlineKeyboardButton("ℹ️ كيف يعمل البوت", callback_data="how_it_works")],
    ]
    welcome_text = (
        f"👋 أهلاً بك يا {user.mention_html()}!\n\n"
        "🎬 <b>أنا بوت تحميل الوسائط من جميع مواقع التواصل!</b>\n\n"
        "<b>📥 الاستخدام بسيط:</b>\n"
        "أرسل أي رابط وسأحمّله لك فوراً (فيديو، صوت، أو صورة)!\n\n"
        "💡 <i>جرب الآن! أرسل لي أي رابط</i>"
    )
    if update.callback_query:
        await update.callback_query.edit_message_text(welcome_text, parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard))
    else:
        await update.message.reply_html(welcome_text, reply_markup=InlineKeyboardMarkup(keyboard))

async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_html("📚 <b>الأوامر المتاحة</b>\nفقط أرسل أي رابط وسأحمّله!\n\n<code>/stats</code> - إحصائياتك\n<code>/platforms</code> - المنصات")

async def cmd_platforms(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_html("🌐 <b>المنصات المدعومة:</b>\nYouTube, TikTok, Instagram, Twitter/X, Facebook, Snapchat, Pinterest, + 1000 موقع آخر!")

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

    # معالجة القوائم المبسطة
    keyboard = [[InlineKeyboardButton("🔙 رجوع", callback_data="back_main")]]
    await query.edit_message_text("🔍 " + data.replace("_", " ").title(), reply_markup=InlineKeyboardMarkup(keyboard))

# ================== التحميل المتقدم ==================
def get_ytdlp_options(url: str, format_type: str = "video", quality: str = "best",
                     output_template: str = None, progress_hook=None) -> dict:
    if output_template is None:
        output_template = os.path.join(DOWNLOADS_DIR, f"{uuid.uuid4().hex[:12]}_%(title).80s.%(ext)s")

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
        "compat_opts": ["no-unsafe-extension"], # 🟢 حل السناب شات
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
    }

    if progress_hook:
        common["progress_hooks"] = [progress_hook]

    if is_youtube(url):
        common["extractor_args"] = {
            "youtube": {
                "player_client": ["android", "web", "tv_simply"]
            }
        }
        if os.path.exists(YOUTUBE_COOKIES):
            common["cookiefile"] = YOUTUBE_COOKIES
            logger.info("📄 استخدام كوكيز YouTube")

    elif is_instagram(url) and os.path.exists(INSTAGRAM_COOKIES):
        common["cookiefile"] = INSTAGRAM_COOKIES
    elif is_facebook(url) and os.path.exists(FACEBOOK_COOKIES):
        common["cookiefile"] = FACEBOOK_COOKIES
    elif is_tiktok(url) and os.path.exists(TIKTOK_COOKIES):
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
    else:
        # 🟢 حل الجودات (دمج الصوت والصورة بصيغة مدعومة)
        if quality == "best":
            common["format"] = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
        elif quality == "low":
            common["format"] = "worstvideo[ext=mp4]+worstaudio[ext=m4a]/worst[ext=mp4]/worst"
        elif quality == "medium":
            common["format"] = "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
        elif quality == "high":
            common["format"] = "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
        else:
            common["format"] = quality

    return common

async def get_video_info(url: str) -> Optional[dict]:
    try:
        opts = {"quiet": True, "no_warnings": True, "noplaylist": True, "socket_timeout": 30}
        if is_youtube(url):
            opts["extractor_args"] = {"youtube": {"player_client": ["android", "web", "tv_simply"]}}
            if os.path.exists(YOUTUBE_COOKIES): opts["cookiefile"] = YOUTUBE_COOKIES
        loop = asyncio.get_event_loop()
        return await asyncio.wait_for(loop.run_in_executor(None, lambda: yt_dlp.YoutubeDL(opts).extract_info(url, download=False)), timeout=45)
    except Exception:
        return None

# ================== شريط التقدم ==================
class ProgressTracker:
    def __init__(self, context, chat_id, message_id, platform, format_type):
        self.context = context
        self.chat_id = chat_id
        self.message_id = message_id
        self.platform = platform
        self.last_update = 0
        self.last_percent = -1
        self.loop = asyncio.get_event_loop()

    def hook(self, d):
        try:
            status = d.get("status", "")
            if status == "downloading":
                downloaded = d.get("downloaded_bytes", 0)
                total = d.get("total_bytes") or d.get("total_bytes_estimate", 0)
                percent = (downloaded / total) * 100 if total else 0
                now = time.time()
                if (now - self.last_update) >= PROGRESS_UPDATE_INTERVAL_SEC and abs(percent - self.last_percent) >= 1:
                    self.last_update = now
                    self.last_percent = percent
                    bar = make_progress_bar(percent)
                    text = f"⏳ <b>جاري التحميل من {self.platform}</b>\n\n{bar}\n📦 {format_size(downloaded)} / {format_size(total)}"
                    asyncio.run_coroutine_threadsafe(self._update_message(text), self.loop)
            elif status == "finished":
                text = f"⚙️ <b>جاري المعالجة من {self.platform}</b>\n\n[{'█' * 15}] 100%\n\n🔄 يتم تجهيز الملف..."
                asyncio.run_coroutine_threadsafe(self._update_message(text), self.loop)
        except Exception:
            pass

    async def _update_message(self, text):
        try:
            await self.context.bot.edit_message_text(chat_id=self.chat_id, message_id=self.message_id, text=text, parse_mode=ParseMode.HTML)
        except Exception:
            pass

# ================== تحميل الميديا الرئيسي ==================
async def download_media(url: str, format_type: str = "video", quality: str = "best",
                          progress_tracker: Optional[ProgressTracker] = None) -> Tuple[Optional[str], Optional[dict], Optional[str], Optional[str]]:
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

        filepath, info = await asyncio.wait_for(loop.run_in_executor(None, _download), timeout=DOWNLOAD_TIMEOUT_SEC)
        if not os.path.exists(filepath):
            return None, info, "الملف لم يُحفظ بشكل صحيح", "File not found"
        return filepath, info, None, None

    except yt_dlp.utils.DownloadError as e:
        err = str(e)
        details = traceback.format_exc()
        # 🟢 إخفاء التفاصيل التقنية عن المستخدم
        user_msg = "❌ عذراً، فشل التحميل بسبب قيود من المنصة أو أن المحتوى خاص/محذوف."
        return None, None, user_msg, details
    except Exception as e:
        details = traceback.format_exc()
        return None, None, "❌ حدث خطأ غير متوقع أثناء معالجة الطلب.", details

# ================== معالج الروابط ==================
URL_PATTERN = re.compile(r"https?://[^\s]+")

async def handle_link(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    register_user(user)
    if is_user_banned(user.id): return

    urls = URL_PATTERN.findall(update.message.text or "")
    if not urls: return
    url = urls[0]
    platform = detect_platform(url) or "🌐 موقع آخر"

    allowed, remaining = check_rate_limit(user.id)
    if not allowed:
        await update.message.reply_html("⏳ <b>تجاوزت الحد المسموح!</b>\nحاول بعد ساعة.")
        return

    context.user_data["pending_url"] = url
    context.user_data["pending_platform"] = platform

    keyboard = [
        [InlineKeyboardButton("📹 تحميل فيديو / صورة", callback_data="dl_video_best")],
        [InlineKeyboardButton("🎵 تحميل صوت MP3", callback_data="dl_audio_best")],
        [InlineKeyboardButton("❌ إلغاء", callback_data="cancel")],
    ]
    await update.message.reply_html(f"🔗 <b>الرابط مكتشف!</b>\n📡 {platform}\nاختر النوع:", reply_markup=InlineKeyboardMarkup(keyboard))

async def handle_download_choice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user = query.from_user
    parts = query.data.split("_")
    if len(parts) < 3: return
    _, format_type, quality = parts[0], parts[1], parts[2]

    url = context.user_data.get("pending_url")
    platform = context.user_data.get("pending_platform", "🌐 غير معروف")
    if not url:
        await query.edit_message_text("❌ انتهت صلاحية الطلب. أرسل الرابط مرة أخرى.")
        return

    await query.edit_message_text(f"⏳ <b>بدء التحميل من {platform}...</b>", parse_mode=ParseMode.HTML)
    progress = ProgressTracker(context, query.message.chat_id, query.message.message_id, platform, format_type)
    
    filepath, info, error, error_details = await download_media(url, format_type, quality, progress)

    if error or not filepath:
        context.user_data.update({"error_url": url, "error_platform": platform, "error_msg": error, "error_details": error_details})
        keyboard = [[InlineKeyboardButton("📢 إبلاغ المطور", callback_data=f"report_dl_{user.id}")]]
        await query.edit_message_text(f"{error}", parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard))
        return

    file_size = os.path.getsize(filepath)
    if file_size > MAX_FILE_SIZE_BYTES:
        await query.edit_message_text("⚠️ <b>الملف كبير جداً (الحد 50 MB)</b>", parse_mode=ParseMode.HTML)
        try: os.remove(filepath)
        except: pass
        return

    await query.edit_message_text(f"📤 <b>جاري الرفع إلى تيليجرام...</b>\n💾 {format_size(file_size)}", parse_mode=ParseMode.HTML)

    title = (info.get("title", "") if info else "")[:200]
    caption = f"📡 <b>{platform}</b>\n📝 {title}\n🤖 @{context.bot.username}"

    try:
        # 🟢 دعم التعرف على الصور وإرسالها بشكل صحيح
        ext = filepath.split('.')[-1].lower()
        image_extensions = ['jpg', 'jpeg', 'png', 'webp', 'heic']

        with open(filepath, "rb") as f:
            if ext in image_extensions:
                await context.bot.send_photo(
                    chat_id=query.message.chat_id,
                    photo=f,
                    caption=caption,
                    parse_mode=ParseMode.HTML,
                )
            elif format_type == "audio" or ext == "mp3":
                await context.bot.send_audio(
                    chat_id=query.message.chat_id,
                    audio=f,
                    caption=caption,
                    parse_mode=ParseMode.HTML,
                    title=title[:64] if title else None,
                )
            else:
                await context.bot.send_video(
                    chat_id=query.message.chat_id,
                    video=f,
                    caption=caption,
                    parse_mode=ParseMode.HTML,
                    supports_streaming=True,
                )

        download_id = log_download(user, platform, url, title, format_type, file_size / (1024*1024), "success")
        kb = [[InlineKeyboardButton(f"{'⭐'*i}", callback_data=f"rate_{download_id}_{i}") for i in range(1, 6)]]
        await query.edit_message_text("✅ <b>تم الإرسال بنجاح!</b>\n🌟 <b>قيّم الخدمة:</b>", parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(kb))

    except Exception as e:
        context.user_data.update({"error_url": url, "error_platform": platform, "error_msg": str(e), "error_details": traceback.format_exc()})
        await query.edit_message_text("❌ <b>فشل الرفع لتيليجرام.</b>", parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("📢 إبلاغ", callback_data=f"report_send_{user.id}")]]))
    finally:
        try: os.remove(filepath)
        except: pass

# ================== التقييم والإبلاغ ==================
async def handle_rating(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    parts = query.data.split("_")
    if len(parts) == 3:
        try:
            with get_db() as conn:
                conn.execute("UPDATE downloads SET rating = ? WHERE id = ? AND user_id = ?", (int(parts[2]), int(parts[1]), query.from_user.id))
            await query.edit_message_text(f"✅ <b>شكراً لتقييمك!</b> {'⭐'*int(parts[2])}", parse_mode=ParseMode.HTML)
        except: pass

async def handle_report_error(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user = query.from_user
    url, platform = context.user_data.get("error_url", "?"), context.user_data.get("error_platform", "?")
    msg, details = context.user_data.get("error_msg", "?"), context.user_data.get("error_details", "")
    try:
        with get_db() as conn:
            cur = conn.execute("INSERT INTO error_reports (user_id, username, url, platform, error_message, error_details) VALUES (?, ?, ?, ?, ?, ?)",
                               (user.id, user.username or "", url, platform, msg, details))
            report_id = cur.lastrowid
        
        if OWNER_ID:
            await context.bot.send_message(chat_id=OWNER_ID, text=f"🚨 <b>خطأ #{report_id}</b>\nمن: {user.mention_html()}\nالرابط: {url}\nالخطأ: {msg}", parse_mode=ParseMode.HTML,
                                           reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("📋 تفاصيل", callback_data=f"err_details_{report_id}")]]))
        await query.edit_message_text(f"✅ تم إرسال التقرير #{report_id} للمطور.", parse_mode=ParseMode.HTML)
    except: pass

async def handle_error_action(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    if query.from_user.id != OWNER_ID: return
    parts = query.data.split("_")
    if len(parts) >= 3 and parts[1] == "details":
        with get_db() as conn:
            report = conn.execute("SELECT error_details FROM error_reports WHERE id=?", (parts[2],)).fetchone()
            if report: await query.message.reply_html(f"<code>{report['error_details'][:3500]}</code>")

# ================== أوامر الإدارة ==================
async def cmd_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != OWNER_ID: return
    await update.message.reply_html("🔐 <b>لوحة الإدارة</b>\n/setcookies [youtube/tiktok]\n/cleanup - تنظيف الملفات المؤقتة")

async def cmd_setcookies(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != OWNER_ID: return
    await update.message.reply_html("🍪 أرسل ملف `cookies.txt` واكتب في الوصف `youtube` أو `tiktok`.")

async def handle_cookies_upload(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != OWNER_ID or not update.message.document: return
    caption = (update.message.caption or "").lower()
    target = YOUTUBE_COOKIES if "youtube" in caption else TIKTOK_COOKIES if "tiktok" in caption else None
    if not target:
        await update.message.reply_text("⚠️ اكتب youtube أو tiktok في الوصف.")
        return
    file = await update.message.document.get_file()
    await file.download_to_drive(target)
    await update.message.reply_text(f"✅ تم حفظ الكوكيز في {target}")

async def cmd_cleanup(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id == OWNER_ID:
        cleanup_old_files()
        await update.message.reply_text("🧹 تم تنظيف الملفات.")

# ================== التشغيل ==================
async def health_check(request):
    return web.json_response({"status": "alive"})

async def start_web_server():
    app = web.Application()
    app.router.add_get("/", health_check)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()

async def post_init(application: Application):
    await application.bot.set_my_commands([BotCommand("start", "البداية"), BotCommand("admin", "الإدارة (للمالك)")])
    await start_web_server()

def main():
    init_database()
    application = Application.builder().token(BOT_TOKEN).post_init(post_init).build()
    
    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("help", cmd_help))
    application.add_handler(CommandHandler("platforms", cmd_platforms))
    application.add_handler(CommandHandler("admin", cmd_admin))
    application.add_handler(CommandHandler("setcookies", cmd_setcookies))
    application.add_handler(CommandHandler("cleanup", cmd_cleanup))
    application.add_handler(CallbackQueryHandler(callback_handler))
    application.add_handler(MessageHandler(filters.Document.ALL & filters.User(OWNER_ID), handle_cookies_upload))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND & filters.Regex(URL_PATTERN), handle_link))

    application.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
