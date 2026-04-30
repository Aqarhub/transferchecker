import asyncio
import os
import re
import tempfile
import logging
from pathlib import Path

from aiogram import Bot, Dispatcher, F
from aiogram.types import Message, FSInputFile
from aiogram.filters import CommandStart, Command
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties

import yt_dlp

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
MAX_SIZE_MB = 50  # Telegram bot upload limit

# ── Supported domains ─────────────────────────────────────────────────────────
SUPPORTED = {
    "tiktok.com":      "TikTok 🎵",
    "vm.tiktok.com":   "TikTok 🎵",
    "snapchat.com":    "Snapchat 👻",
    "instagram.com":   "Instagram 📸",
    "soundcloud.com":  "SoundCloud 🎧",
    "pinterest.com":   "Pinterest 📌",
    "pin.it":          "Pinterest 📌",
    "youtube.com":     "YouTube ▶️",
    "youtu.be":        "YouTube ▶️",
    "music.youtube.com": "YouTube Music 🎵",
}

URL_RE = re.compile(r"https?://[^\s]+")


def detect_platform(url: str) -> str | None:
    for domain, name in SUPPORTED.items():
        if domain in url:
            return name
    return None


def is_audio_platform(url: str) -> bool:
    return "soundcloud.com" in url


async def download_media(url: str, tmp_dir: str) -> tuple[str, str]:
    """
    Returns (filepath, title).
    Raises ValueError if file is too large or unsupported.
    """
    audio_only = is_audio_platform(url)

    ydl_opts: dict = {
        "outtmpl": f"{tmp_dir}/%(title).60s.%(ext)s",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "max_filesize": MAX_SIZE_MB * 1024 * 1024,
    }

    if audio_only:
        ydl_opts.update({
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
        })
    else:
        # Best video that fits under 50 MB — prefer mp4
        ydl_opts.update({
            "format": "bestvideo[ext=mp4][filesize<45M]+bestaudio[ext=m4a]/best[ext=mp4][filesize<45M]/best[filesize<45M]",
            "merge_output_format": "mp4",
        })

    loop = asyncio.get_event_loop()

    def _download():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get("title", "media")
            # Find the downloaded file
            files = list(Path(tmp_dir).iterdir())
            if not files:
                raise ValueError("لم يُحمَّل أي ملف.")
            filepath = str(max(files, key=lambda f: f.stat().st_size))
            size_mb = Path(filepath).stat().st_size / (1024 * 1024)
            if size_mb > MAX_SIZE_MB:
                raise ValueError(f"حجم الملف ({size_mb:.1f} MB) يتجاوز حد تيليجرام (50 MB).")
            return filepath, title

    return await loop.run_in_executor(None, _download)


# ── Bot & Dispatcher ──────────────────────────────────────────────────────────
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()


# ── Handlers ──────────────────────────────────────────────────────────────────
@dp.message(CommandStart())
async def cmd_start(msg: Message):
    await msg.answer(
        "👋 <b>أهلاً!</b>\n\n"
        "أرسل لي رابطاً من أي موقع مدعوم وسأحمّله لك فوراً 🚀\n\n"
        "<b>المواقع المدعومة:</b>\n"
        "• TikTok 🎵\n"
        "• Snapchat 👻\n"
        "• Instagram 📸\n"
        "• SoundCloud 🎧\n"
        "• Pinterest 📌\n"
        "• YouTube ▶️\n\n"
        "⚠️ الحد الأقصى للحجم: <b>50 MB</b>"
    )


@dp.message(Command("help"))
async def cmd_help(msg: Message):
    await msg.answer(
        "📖 <b>كيفية الاستخدام:</b>\n\n"
        "1️⃣ انسخ رابط الفيديو أو الصوت\n"
        "2️⃣ أرسله مباشرةً للبوت\n"
        "3️⃣ انتظر قليلاً وستصلك الميديا ✅\n\n"
        "<b>ملاحظات:</b>\n"
        "• SoundCloud يُرسَل كملف صوتي MP3\n"
        "• باقي المواقع تُرسَل كفيديو MP4\n"
        "• الحد الأقصى 50 MB بسبب قيود تيليجرام"
    )


@dp.message(F.text)
async def handle_url(msg: Message):
    text = msg.text or ""
    urls = URL_RE.findall(text)

    if not urls:
        await msg.answer("⚠️ لم أجد رابطاً في رسالتك. أرسل رابطاً مباشرةً.")
        return

    url = urls[0]
    platform = detect_platform(url)

    if not platform:
        supported_list = "\n".join(f"• {name}" for name in dict.fromkeys(SUPPORTED.values()))
        await msg.answer(
            f"❌ هذا الموقع غير مدعوم.\n\n"
            f"<b>المواقع المدعومة:</b>\n{supported_list}"
        )
        return

    status = await msg.answer(f"⏳ جارٍ التحميل من <b>{platform}</b>...")

    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            filepath, title = await download_media(url, tmp_dir)
            ext = Path(filepath).suffix.lower()
            file = FSInputFile(filepath, filename=Path(filepath).name)

            if ext in (".mp3", ".m4a", ".ogg", ".wav", ".flac", ".opus"):
                await msg.answer_audio(file, title=title, caption=f"🎧 <b>{title}</b>")
            elif ext in (".jpg", ".jpeg", ".png", ".webp"):
                await msg.answer_photo(file, caption=f"🖼 <b>{title}</b>")
            else:
                await msg.answer_video(file, caption=f"🎬 <b>{title}</b>", supports_streaming=True)

            await status.delete()

    except ValueError as e:
        await status.edit_text(f"⚠️ {e}")
    except yt_dlp.utils.DownloadError as e:
        err = str(e)
        if "Unsupported URL" in err:
            await status.edit_text("❌ الرابط غير مدعوم أو غير صحيح.")
        elif "Private" in err or "login" in err.lower():
            await status.edit_text("🔒 هذا المحتوى خاص أو يتطلب تسجيل دخول.")
        elif "429" in err or "rate" in err.lower():
            await status.edit_text("⏱ الموقع يحد من الطلبات، حاول بعد قليل.")
        else:
            log.error("DownloadError: %s", err)
            await status.edit_text("❌ فشل التحميل. تحقق من الرابط أو حاول لاحقاً.")
    except Exception as e:
        log.exception("Unexpected error: %s", e)
        await status.edit_text("❌ حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.")


# ── Entry Point ───────────────────────────────────────────────────────────────
async def main():
    log.info("Bot is starting...")
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


if __name__ == "__main__":
    asyncio.run(main())
