"""
🤖 بوت إدارة وحماية القنوات والمجموعات
==========================================
مطور بواسطة: مساعد ذكي
المنصة: Telegram Bot API
الاستضافة: Render.com
"""

import os
import re
import logging
import asyncio
import sqlite3
import json
from datetime import datetime, timedelta
from typing import Optional, List, Dict
from contextlib import contextmanager

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ChatPermissions,
    ChatMember,
    BotCommand,
)
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ChatMemberHandler,
    ContextTypes,
    filters,
)
from telegram.constants import ChatType, ParseMode
from telegram.error import BadRequest, Forbidden

from aiohttp import web

# ================== الإعدادات ==================
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
OWNER_ID = int(os.getenv("OWNER_ID", "0"))  # معرف المالك
PORT = int(os.getenv("PORT", "10000"))
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")  # مثال: https://your-app.onrender.com
DB_PATH = os.getenv("DB_PATH", "bot_data.db")

# ================== التسجيل ==================
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# ================== قاعدة البيانات ==================

@contextmanager
def get_db():
    """مدير اتصال قاعدة البيانات"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_database():
    """إنشاء جداول قاعدة البيانات"""
    with get_db() as conn:
        cur = conn.cursor()

        # جدول المجموعات
        cur.execute("""
            CREATE TABLE IF NOT EXISTS chats (
                chat_id INTEGER PRIMARY KEY,
                title TEXT,
                type TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                welcome_enabled INTEGER DEFAULT 1,
                welcome_message TEXT DEFAULT '',
                antiflood_enabled INTEGER DEFAULT 1,
                antilink_enabled INTEGER DEFAULT 1,
                antispam_enabled INTEGER DEFAULT 1,
                night_mode INTEGER DEFAULT 0,
                language TEXT DEFAULT 'ar'
            )
        """)

        # جدول الردود السريعة
        cur.execute("""
            CREATE TABLE IF NOT EXISTS quick_replies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER,
                trigger TEXT,
                response TEXT,
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                use_count INTEGER DEFAULT 0,
                UNIQUE(chat_id, trigger)
            )
        """)

        # جدول التحذيرات
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER,
                user_id INTEGER,
                reason TEXT,
                warned_by INTEGER,
                warned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # جدول المستخدمين المحظورة كلماتهم
        cur.execute("""
            CREATE TABLE IF NOT EXISTS banned_words (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER,
                word TEXT,
                added_by INTEGER,
                UNIQUE(chat_id, word)
            )
        """)

        # جدول الإحصائيات
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_stats (
                chat_id INTEGER,
                user_id INTEGER,
                username TEXT,
                first_name TEXT,
                message_count INTEGER DEFAULT 0,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (chat_id, user_id)
            )
        """)

        # جدول القواعد
        cur.execute("""
            CREATE TABLE IF NOT EXISTS rules (
                chat_id INTEGER PRIMARY KEY,
                rules_text TEXT
            )
        """)

        # جدول مكافحة الفيضان
        cur.execute("""
            CREATE TABLE IF NOT EXISTS flood_tracker (
                chat_id INTEGER,
                user_id INTEGER,
                message_time REAL,
                message_text TEXT
            )
        """)

        # جدول الملاحظات (Notes)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER,
                note_name TEXT,
                content TEXT,
                created_by INTEGER,
                UNIQUE(chat_id, note_name)
            )
        """)

        # جدول الكتم المؤقت
        cur.execute("""
            CREATE TABLE IF NOT EXISTS muted_users (
                chat_id INTEGER,
                user_id INTEGER,
                muted_until TIMESTAMP,
                PRIMARY KEY (chat_id, user_id)
            )
        """)

        logger.info("✅ تم تهيئة قاعدة البيانات بنجاح")


# ================== الدوال المساعدة ==================

async def is_user_admin(update: Update, user_id: Optional[int] = None) -> bool:
    """التحقق من كون المستخدم مشرفاً"""
    if user_id is None:
        user_id = update.effective_user.id

    if user_id == OWNER_ID:
        return True

    chat = update.effective_chat
    if chat.type == ChatType.PRIVATE:
        return True

    try:
        member = await chat.get_member(user_id)
        return member.status in ["creator", "administrator"]
    except Exception as e:
        logger.error(f"خطأ في فحص الإدارة: {e}")
        return False


def register_chat(chat_id: int, title: str, chat_type: str):
    """تسجيل المجموعة في قاعدة البيانات"""
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO chats (chat_id, title, type) VALUES (?, ?, ?)",
            (chat_id, title, chat_type),
        )


def parse_time(time_str: str) -> Optional[timedelta]:
    """تحويل النص الزمني إلى timedelta"""
    pattern = re.match(r"(\d+)\s*([smhdwSMHDW])", time_str.strip())
    if not pattern:
        return None

    amount = int(pattern.group(1))
    unit = pattern.group(2).lower()

    units = {
        "s": timedelta(seconds=amount),
        "m": timedelta(minutes=amount),
        "h": timedelta(hours=amount),
        "d": timedelta(days=amount),
        "w": timedelta(weeks=amount),
    }
    return units.get(unit)


# ================== أوامر البداية ==================

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """أمر البداية"""
    user = update.effective_user
    chat = update.effective_chat

    if chat.type == ChatType.PRIVATE:
        keyboard = [
            [
                InlineKeyboardButton(
                    "➕ أضفني إلى مجموعتك",
                    url=f"https://t.me/{context.bot.username}?startgroup=true",
                )
            ],
            [
                InlineKeyboardButton("📚 الأوامر", callback_data="help_main"),
                InlineKeyboardButton("🛡️ الحماية", callback_data="help_protect"),
            ],
            [
                InlineKeyboardButton("⚡ الردود السريعة", callback_data="help_replies"),
                InlineKeyboardButton("📊 الإحصائيات", callback_data="help_stats"),
            ],
            [InlineKeyboardButton("ℹ️ حول البوت", callback_data="about")],
        ]

        welcome_text = (
            f"👋 أهلاً بك يا {user.mention_html()}!\n\n"
            "🤖 أنا بوت ذكي لإدارة وحماية القنوات والمجموعات.\n\n"
            "<b>✨ ميزاتي الرئيسية:</b>\n"
            "🛡️ <b>حماية متقدمة</b> ضد السبام والروابط والفيضان\n"
            "⚡ <b>ردود سريعة</b> ذكية للأسئلة المتكررة\n"
            "👮 <b>إدارة كاملة</b> (حظر، كتم، تحذير)\n"
            "📊 <b>إحصائيات</b> تفصيلية للمجموعة\n"
            "🌙 <b>الوضع الليلي</b> لإغلاق الدردشة ليلاً\n"
            "📝 <b>ملاحظات وقواعد</b> للمجموعة\n"
            "👋 <b>رسائل ترحيب</b> مخصصة\n\n"
            "اضغط على الأزرار أدناه لاستكشاف ميزاتي 👇"
        )
        await update.message.reply_html(
            welcome_text, reply_markup=InlineKeyboardMarkup(keyboard)
        )
    else:
        register_chat(chat.id, chat.title, chat.type)
        await update.message.reply_text(
            "✅ البوت جاهز للعمل في هذه المجموعة!\nاكتب /help لعرض الأوامر."
        )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """عرض المساعدة"""
    help_text = (
        "📚 <b>قائمة الأوامر الكاملة</b>\n\n"
        "<b>🛡️ أوامر الإدارة:</b>\n"
        "<code>/ban</code> - حظر مستخدم (بالرد)\n"
        "<code>/unban</code> - إلغاء الحظر\n"
        "<code>/mute [مدة]</code> - كتم مستخدم (مثال: 1h, 30m, 2d)\n"
        "<code>/unmute</code> - إلغاء الكتم\n"
        "<code>/kick</code> - طرد مستخدم\n"
        "<code>/warn [سبب]</code> - تحذير مستخدم\n"
        "<code>/warns</code> - عرض تحذيرات المستخدم\n"
        "<code>/resetwarns</code> - مسح التحذيرات\n"
        "<code>/pin</code> - تثبيت رسالة\n"
        "<code>/unpin</code> - إلغاء التثبيت\n"
        "<code>/purge</code> - حذف الرسائل (بالرد)\n\n"
        "<b>⚡ الردود السريعة:</b>\n"
        "<code>/addreply [كلمة] [رد]</code> - إضافة رد\n"
        "<code>/delreply [كلمة]</code> - حذف رد\n"
        "<code>/replies</code> - عرض كل الردود\n"
        "<code>/topreplies</code> - أكثر الردود استخداماً\n\n"
        "<b>📝 الملاحظات والقواعد:</b>\n"
        "<code>/save [اسم] [محتوى]</code> - حفظ ملاحظة\n"
        "<code>/get [اسم]</code> أو <code>#اسم</code> - استرجاع\n"
        "<code>/notes</code> - قائمة الملاحظات\n"
        "<code>/delnote [اسم]</code> - حذف ملاحظة\n"
        "<code>/setrules [نص]</code> - تعيين القواعد\n"
        "<code>/rules</code> - عرض القواعد\n\n"
        "<b>🚫 الفلترة:</b>\n"
        "<code>/addword [كلمة]</code> - إضافة كلمة محظورة\n"
        "<code>/delword [كلمة]</code> - حذف كلمة محظورة\n"
        "<code>/words</code> - الكلمات المحظورة\n\n"
        "<b>⚙️ الإعدادات:</b>\n"
        "<code>/setwelcome [نص]</code> - رسالة الترحيب\n"
        "<code>/welcome on/off</code> - تفعيل الترحيب\n"
        "<code>/antilink on/off</code> - حماية الروابط\n"
        "<code>/antiflood on/off</code> - مكافحة الفيضان\n"
        "<code>/nightmode on/off</code> - الوضع الليلي\n\n"
        "<b>📊 الإحصائيات:</b>\n"
        "<code>/stats</code> - إحصائيات المجموعة\n"
        "<code>/top</code> - أنشط الأعضاء\n"
        "<code>/info</code> - معلومات المستخدم\n"
        "<code>/id</code> - معرف المستخدم\n\n"
        "💡 <i>متغيرات الترحيب: {name}, {username}, {chat}, {count}</i>"
    )
    await update.message.reply_html(help_text)


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معالج أزرار الواجهة"""
    query = update.callback_query
    await query.answer()

    data = query.data

    if data == "help_main":
        text = (
            "📚 <b>الأوامر الأساسية</b>\n\n"
            "<code>/start</code> - بدء البوت\n"
            "<code>/help</code> - المساعدة الكاملة\n"
            "<code>/id</code> - معرفك في تيليجرام\n"
            "<code>/info</code> - معلومات حسابك\n"
            "<code>/rules</code> - قواعد المجموعة\n"
            "<code>/stats</code> - إحصائيات المجموعة"
        )
    elif data == "help_protect":
        text = (
            "🛡️ <b>ميزات الحماية</b>\n\n"
            "✅ <b>مكافحة الروابط</b> - حذف الروابط المشبوهة تلقائياً\n"
            "✅ <b>مكافحة الفيضان</b> - منع إغراق المجموعة بالرسائل\n"
            "✅ <b>الكلمات المحظورة</b> - فلترة الكلمات السيئة\n"
            "✅ <b>الوضع الليلي</b> - إغلاق الدردشة في أوقات محددة\n"
            "✅ <b>نظام التحذيرات</b> - 3 تحذيرات = حظر تلقائي\n"
            "✅ <b>كشف الحسابات الجديدة</b> - حماية من البوتات"
        )
    elif data == "help_replies":
        text = (
            "⚡ <b>الردود السريعة</b>\n\n"
            "أضف ردوداً تلقائية للأسئلة المتكررة!\n\n"
            "<b>كيفية الاستخدام:</b>\n"
            "<code>/addreply اسعار اسعارنا تبدأ من 100 ريال</code>\n\n"
            "عند كتابة كلمة <code>اسعار</code> سيرد البوت تلقائياً.\n\n"
            "<b>أوامر إضافية:</b>\n"
            "<code>/replies</code> - كل الردود\n"
            "<code>/topreplies</code> - الأكثر استخداماً\n"
            "<code>/delreply</code> - حذف رد"
        )
    elif data == "help_stats":
        text = (
            "📊 <b>الإحصائيات</b>\n\n"
            "<code>/stats</code> - إحصائيات شاملة\n"
            "<code>/top</code> - أنشط 10 أعضاء\n"
            "<code>/info</code> - معلوماتك التفصيلية\n\n"
            "يتم تتبع:\n"
            "• عدد الرسائل لكل عضو\n"
            "• آخر ظهور\n"
            "• الردود الأكثر استخداماً\n"
            "• نمو المجموعة"
        )
    elif data == "about":
        text = (
            "ℹ️ <b>حول البوت</b>\n\n"
            "🤖 بوت إدارة احترافي للقنوات والمجموعات\n"
            "🔧 مبني بـ Python + python-telegram-bot\n"
            "☁️ مستضاف على Render.com\n"
            "💾 قاعدة بيانات SQLite\n\n"
            "✨ مفتوح المصدر وقابل للتطوير"
        )
    else:
        text = "❓ خيار غير معروف"

    keyboard = [[InlineKeyboardButton("🔙 رجوع", callback_data="back_main")]]
    if data == "back_main":
        await cmd_start(update, context)
        return

    await query.edit_message_text(
        text, parse_mode=ParseMode.HTML, reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ================== أوامر الإدارة ==================

async def cmd_ban(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """حظر مستخدم"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not update.message.reply_to_message:
        await update.message.reply_text("⚠️ يجب الرد على رسالة المستخدم المراد حظره.")
        return

    target = update.message.reply_to_message.from_user
    chat = update.effective_chat

    try:
        await chat.ban_member(target.id)
        reason = " ".join(context.args) if context.args else "بدون سبب"
        await update.message.reply_html(
            f"🔨 تم حظر <b>{target.full_name}</b>\n📝 السبب: {reason}"
        )
    except Exception as e:
        await update.message.reply_text(f"❌ فشل الحظر: {e}")


async def cmd_unban(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """إلغاء حظر مستخدم"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not update.message.reply_to_message and not context.args:
        await update.message.reply_text("⚠️ ردّ على المستخدم أو أرسل معرفه.")
        return

    user_id = (
        update.message.reply_to_message.from_user.id
        if update.message.reply_to_message
        else int(context.args[0])
    )

    try:
        await update.effective_chat.unban_member(user_id)
        await update.message.reply_text("✅ تم إلغاء الحظر.")
    except Exception as e:
        await update.message.reply_text(f"❌ خطأ: {e}")


async def cmd_mute(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """كتم مستخدم"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not update.message.reply_to_message:
        await update.message.reply_text("⚠️ ردّ على رسالة المستخدم المراد كتمه.")
        return

    target = update.message.reply_to_message.from_user
    chat = update.effective_chat

    duration = None
    until_date = None
    if context.args:
        duration = parse_time(context.args[0])
        if duration:
            until_date = datetime.now() + duration

    try:
        await chat.restrict_member(
            target.id,
            permissions=ChatPermissions(can_send_messages=False),
            until_date=until_date,
        )
        time_text = f" لمدة {context.args[0]}" if duration else " بشكل دائم"
        await update.message.reply_html(
            f"🔇 تم كتم <b>{target.full_name}</b>{time_text}"
        )
    except Exception as e:
        await update.message.reply_text(f"❌ فشل الكتم: {e}")


async def cmd_unmute(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """إلغاء كتم مستخدم"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not update.message.reply_to_message:
        await update.message.reply_text("⚠️ ردّ على رسالة المستخدم.")
        return

    target = update.message.reply_to_message.from_user
    chat = update.effective_chat

    try:
        await chat.restrict_member(
            target.id,
            permissions=ChatPermissions(
                can_send_messages=True,
                can_send_audios=True,
                can_send_documents=True,
                can_send_photos=True,
                can_send_videos=True,
                can_send_video_notes=True,
                can_send_voice_notes=True,
                can_send_polls=True,
                can_send_other_messages=True,
                can_add_web_page_previews=True,
            ),
        )
        await update.message.reply_html(f"🔊 تم إلغاء كتم <b>{target.full_name}</b>")
    except Exception as e:
        await update.message.reply_text(f"❌ خطأ: {e}")


async def cmd_kick(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """طرد مستخدم"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not update.message.reply_to_message:
        await update.message.reply_text("⚠️ ردّ على رسالة المستخدم.")
        return

    target = update.message.reply_to_message.from_user
    chat = update.effective_chat

    try:
        await chat.ban_member(target.id)
        await chat.unban_member(target.id)
        await update.message.reply_html(f"👢 تم طرد <b>{target.full_name}</b>")
    except Exception as e:
        await update.message.reply_text(f"❌ خطأ: {e}")


async def cmd_warn(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """تحذير مستخدم"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not update.message.reply_to_message:
        await update.message.reply_text("⚠️ ردّ على رسالة المستخدم.")
        return

    target = update.message.reply_to_message.from_user
    chat = update.effective_chat
    reason = " ".join(context.args) if context.args else "بدون سبب"

    with get_db() as conn:
        conn.execute(
            "INSERT INTO warnings (chat_id, user_id, reason, warned_by) VALUES (?, ?, ?, ?)",
            (chat.id, target.id, reason, update.effective_user.id),
        )
        cur = conn.execute(
            "SELECT COUNT(*) as cnt FROM warnings WHERE chat_id = ? AND user_id = ?",
            (chat.id, target.id),
        )
        warn_count = cur.fetchone()["cnt"]

    msg = (
        f"⚠️ تم تحذير <b>{target.full_name}</b>\n"
        f"📝 السبب: {reason}\n"
        f"🔢 عدد التحذيرات: {warn_count}/3"
    )

    if warn_count >= 3:
        try:
            await chat.ban_member(target.id)
            msg += "\n\n🔨 <b>تم الحظر تلقائياً (وصل لـ 3 تحذيرات)</b>"
            with get_db() as conn:
                conn.execute(
                    "DELETE FROM warnings WHERE chat_id = ? AND user_id = ?",
                    (chat.id, target.id),
                )
        except Exception as e:
            msg += f"\n\n❌ فشل الحظر التلقائي: {e}"

    await update.message.reply_html(msg)


async def cmd_warns(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """عرض تحذيرات المستخدم"""
    target = (
        update.message.reply_to_message.from_user
        if update.message.reply_to_message
        else update.effective_user
    )

    with get_db() as conn:
        cur = conn.execute(
            "SELECT reason, warned_at FROM warnings WHERE chat_id = ? AND user_id = ?",
            (update.effective_chat.id, target.id),
        )
        warnings_list = cur.fetchall()

    if not warnings_list:
        await update.message.reply_html(f"✅ <b>{target.full_name}</b> ليس لديه تحذيرات.")
        return

    text = f"⚠️ <b>تحذيرات {target.full_name}</b> ({len(warnings_list)}/3):\n\n"
    for i, w in enumerate(warnings_list, 1):
        text += f"{i}. {w['reason']} - <i>{w['warned_at'][:16]}</i>\n"

    await update.message.reply_html(text)


async def cmd_resetwarns(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """مسح تحذيرات المستخدم"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not update.message.reply_to_message:
        await update.message.reply_text("⚠️ ردّ على رسالة المستخدم.")
        return

    target = update.message.reply_to_message.from_user
    with get_db() as conn:
        conn.execute(
            "DELETE FROM warnings WHERE chat_id = ? AND user_id = ?",
            (update.effective_chat.id, target.id),
        )
    await update.message.reply_html(f"✅ تم مسح تحذيرات <b>{target.full_name}</b>")


async def cmd_pin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """تثبيت رسالة"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not update.message.reply_to_message:
        await update.message.reply_text("⚠️ ردّ على الرسالة المراد تثبيتها.")
        return

    try:
        await update.message.reply_to_message.pin()
        await update.message.reply_text("📌 تم التثبيت.")
    except Exception as e:
        await update.message.reply_text(f"❌ خطأ: {e}")


async def cmd_unpin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """إلغاء تثبيت رسالة"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    try:
        if update.message.reply_to_message:
            await update.message.reply_to_message.unpin()
        else:
            await update.effective_chat.unpin_all_messages()
        await update.message.reply_text("✅ تم إلغاء التثبيت.")
    except Exception as e:
        await update.message.reply_text(f"❌ خطأ: {e}")


async def cmd_purge(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """حذف عدة رسائل"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not update.message.reply_to_message:
        await update.message.reply_text("⚠️ ردّ على الرسالة لبدء الحذف منها.")
        return

    chat_id = update.effective_chat.id
    start_id = update.message.reply_to_message.message_id
    end_id = update.message.message_id

    deleted = 0
    for msg_id in range(start_id, end_id + 1):
        try:
            await context.bot.delete_message(chat_id, msg_id)
            deleted += 1
        except Exception:
            continue

    sent = await context.bot.send_message(chat_id, f"🗑️ تم حذف {deleted} رسالة.")
    await asyncio.sleep(3)
    try:
        await sent.delete()
    except Exception:
        pass


# ================== الردود السريعة ==================

async def cmd_addreply(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """إضافة رد سريع"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if len(context.args) < 2:
        await update.message.reply_html(
            "⚠️ الاستخدام: <code>/addreply [كلمة] [الرد]</code>\n"
            "مثال: <code>/addreply اسعار أسعارنا تبدأ من 100 ريال</code>"
        )
        return

    trigger = context.args[0].lower()
    response = " ".join(context.args[1:])
    chat_id = update.effective_chat.id

    try:
        with get_db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO quick_replies (chat_id, trigger, response, created_by) VALUES (?, ?, ?, ?)",
                (chat_id, trigger, response, update.effective_user.id),
            )
        await update.message.reply_html(
            f"✅ تم حفظ الرد السريع.\n🔤 الكلمة: <code>{trigger}</code>"
        )
    except Exception as e:
        await update.message.reply_text(f"❌ خطأ: {e}")


async def cmd_delreply(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """حذف رد سريع"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /delreply [الكلمة]")
        return

    trigger = context.args[0].lower()
    with get_db() as conn:
        cur = conn.execute(
            "DELETE FROM quick_replies WHERE chat_id = ? AND trigger = ?",
            (update.effective_chat.id, trigger),
        )
        deleted = cur.rowcount

    if deleted:
        await update.message.reply_html(f"✅ تم حذف الرد: <code>{trigger}</code>")
    else:
        await update.message.reply_text("❌ الرد غير موجود.")


async def cmd_replies(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """عرض كل الردود السريعة"""
    chat_id = update.effective_chat.id
    with get_db() as conn:
        cur = conn.execute(
            "SELECT trigger, use_count FROM quick_replies WHERE chat_id = ? ORDER BY use_count DESC",
            (chat_id,),
        )
        replies = cur.fetchall()

    if not replies:
        await update.message.reply_text("📭 لا توجد ردود سريعة محفوظة.")
        return

    text = f"⚡ <b>الردود السريعة ({len(replies)}):</b>\n\n"
    for r in replies:
        text += f"• <code>{r['trigger']}</code> — استُخدم {r['use_count']} مرة\n"

    await update.message.reply_html(text)


async def cmd_topreplies(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """أكثر الردود استخداماً"""
    chat_id = update.effective_chat.id
    with get_db() as conn:
        cur = conn.execute(
            "SELECT trigger, response, use_count FROM quick_replies WHERE chat_id = ? AND use_count > 0 ORDER BY use_count DESC LIMIT 10",
            (chat_id,),
        )
        replies = cur.fetchall()

    if not replies:
        await update.message.reply_text("📭 لم يتم استخدام أي ردود بعد.")
        return

    text = "🔥 <b>أكثر الأسئلة تداولاً:</b>\n\n"
    for i, r in enumerate(replies, 1):
        emoji = ["🥇", "🥈", "🥉"][i - 1] if i <= 3 else f"{i}."
        preview = r["response"][:50] + ("..." if len(r["response"]) > 50 else "")
        text += f"{emoji} <code>{r['trigger']}</code> ({r['use_count']}x)\n   ↳ {preview}\n\n"

    await update.message.reply_html(text)


# ================== الملاحظات ==================

async def cmd_save(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """حفظ ملاحظة"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if len(context.args) < 2:
        await update.message.reply_html(
            "⚠️ الاستخدام: <code>/save [اسم] [محتوى]</code>"
        )
        return

    name = context.args[0].lower()
    content = " ".join(context.args[1:])

    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO notes (chat_id, note_name, content, created_by) VALUES (?, ?, ?, ?)",
            (update.effective_chat.id, name, content, update.effective_user.id),
        )

    await update.message.reply_html(
        f"✅ تم حفظ الملاحظة <code>#{name}</code>\nاستدعها بكتابة <code>#{name}</code>"
    )


async def cmd_get(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """استرجاع ملاحظة"""
    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /get [اسم]")
        return

    name = context.args[0].lower()
    with get_db() as conn:
        cur = conn.execute(
            "SELECT content FROM notes WHERE chat_id = ? AND note_name = ?",
            (update.effective_chat.id, name),
        )
        note = cur.fetchone()

    if note:
        await update.message.reply_text(note["content"])
    else:
        await update.message.reply_text("❌ الملاحظة غير موجودة.")


async def cmd_notes(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """قائمة الملاحظات"""
    with get_db() as conn:
        cur = conn.execute(
            "SELECT note_name FROM notes WHERE chat_id = ?",
            (update.effective_chat.id,),
        )
        notes_list = cur.fetchall()

    if not notes_list:
        await update.message.reply_text("📭 لا توجد ملاحظات محفوظة.")
        return

    text = f"📝 <b>الملاحظات ({len(notes_list)}):</b>\n\n"
    text += "\n".join(f"• <code>#{n['note_name']}</code>" for n in notes_list)
    await update.message.reply_html(text)


async def cmd_delnote(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """حذف ملاحظة"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /delnote [اسم]")
        return

    name = context.args[0].lower()
    with get_db() as conn:
        cur = conn.execute(
            "DELETE FROM notes WHERE chat_id = ? AND note_name = ?",
            (update.effective_chat.id, name),
        )

    if cur.rowcount:
        await update.message.reply_html(f"✅ تم حذف <code>#{name}</code>")
    else:
        await update.message.reply_text("❌ الملاحظة غير موجودة.")


# ================== القواعد ==================

async def cmd_setrules(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """تعيين قواعد المجموعة"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /setrules [نص القواعد]")
        return

    rules_text = " ".join(context.args)
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO rules (chat_id, rules_text) VALUES (?, ?)",
            (update.effective_chat.id, rules_text),
        )
    await update.message.reply_text("✅ تم تعيين القواعد.")


async def cmd_rules(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """عرض القواعد"""
    with get_db() as conn:
        cur = conn.execute(
            "SELECT rules_text FROM rules WHERE chat_id = ?",
            (update.effective_chat.id,),
        )
        row = cur.fetchone()

    if row and row["rules_text"]:
        await update.message.reply_html(f"📜 <b>قواعد المجموعة:</b>\n\n{row['rules_text']}")
    else:
        await update.message.reply_text("📭 لم يتم تعيين قواعد بعد.")


# ================== الكلمات المحظورة ==================

async def cmd_addword(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """إضافة كلمة محظورة"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /addword [كلمة]")
        return

    word = " ".join(context.args).lower()
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO banned_words (chat_id, word, added_by) VALUES (?, ?, ?)",
                (update.effective_chat.id, word, update.effective_user.id),
            )
        await update.message.reply_html(f"🚫 تم حظر الكلمة: <code>{word}</code>")
    except sqlite3.IntegrityError:
        await update.message.reply_text("⚠️ الكلمة محظورة مسبقاً.")


async def cmd_delword(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """حذف كلمة من المحظورة"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not context.args:
        await update.message.reply_text("⚠️ الاستخدام: /delword [كلمة]")
        return

    word = " ".join(context.args).lower()
    with get_db() as conn:
        cur = conn.execute(
            "DELETE FROM banned_words WHERE chat_id = ? AND word = ?",
            (update.effective_chat.id, word),
        )

    if cur.rowcount:
        await update.message.reply_html(f"✅ تم إلغاء حظر: <code>{word}</code>")
    else:
        await update.message.reply_text("❌ الكلمة غير موجودة.")


async def cmd_words(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """قائمة الكلمات المحظورة"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    with get_db() as conn:
        cur = conn.execute(
            "SELECT word FROM banned_words WHERE chat_id = ?",
            (update.effective_chat.id,),
        )
        words_list = cur.fetchall()

    if not words_list:
        await update.message.reply_text("📭 لا توجد كلمات محظورة.")
        return

    text = f"🚫 <b>الكلمات المحظورة ({len(words_list)}):</b>\n\n"
    text += "\n".join(f"• <code>{w['word']}</code>" for w in words_list)
    await update.message.reply_html(text)


# ================== الإعدادات ==================

async def cmd_setwelcome(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """تعيين رسالة الترحيب"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    if not context.args:
        await update.message.reply_html(
            "⚠️ الاستخدام: <code>/setwelcome [النص]</code>\n\n"
            "<b>المتغيرات المتاحة:</b>\n"
            "<code>{name}</code> - اسم العضو\n"
            "<code>{username}</code> - معرف العضو\n"
            "<code>{chat}</code> - اسم المجموعة\n"
            "<code>{count}</code> - عدد الأعضاء"
        )
        return

    msg = " ".join(context.args)
    with get_db() as conn:
        conn.execute(
            "UPDATE chats SET welcome_message = ? WHERE chat_id = ?",
            (msg, update.effective_chat.id),
        )
    await update.message.reply_text("✅ تم تعيين رسالة الترحيب.")


async def cmd_toggle_setting(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """تفعيل/تعطيل إعداد"""
    if not await is_user_admin(update):
        await update.message.reply_text("❌ هذا الأمر للمشرفين فقط.")
        return

    cmd = update.message.text.split()[0].lstrip("/").split("@")[0]
    setting_map = {
        "welcome": "welcome_enabled",
        "antilink": "antilink_enabled",
        "antiflood": "antiflood_enabled",
        "antispam": "antispam_enabled",
        "nightmode": "night_mode",
    }

    setting = setting_map.get(cmd)
    if not setting:
        return

    if not context.args or context.args[0].lower() not in ["on", "off"]:
        await update.message.reply_text(f"⚠️ الاستخدام: /{cmd} on/off")
        return

    value = 1 if context.args[0].lower() == "on" else 0
    with get_db() as conn:
        conn.execute(
            f"UPDATE chats SET {setting} = ? WHERE chat_id = ?",
            (value, update.effective_chat.id),
        )

    status = "✅ مفعّل" if value else "❌ معطّل"
    await update.message.reply_text(f"{status} - {cmd}")


# ================== الإحصائيات ==================

async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """إحصائيات المجموعة"""
    chat = update.effective_chat
    chat_id = chat.id

    with get_db() as conn:
        total_msgs = conn.execute(
            "SELECT SUM(message_count) as total FROM user_stats WHERE chat_id = ?",
            (chat_id,),
        ).fetchone()["total"] or 0

        total_users = conn.execute(
            "SELECT COUNT(*) as cnt FROM user_stats WHERE chat_id = ?", (chat_id,)
        ).fetchone()["cnt"]

        total_replies = conn.execute(
            "SELECT COUNT(*) as cnt FROM quick_replies WHERE chat_id = ?", (chat_id,)
        ).fetchone()["cnt"]

        total_notes = conn.execute(
            "SELECT COUNT(*) as cnt FROM notes WHERE chat_id = ?", (chat_id,)
        ).fetchone()["cnt"]

    try:
        member_count = await chat.get_member_count()
    except Exception:
        member_count = "غير متاح"

    text = (
        f"📊 <b>إحصائيات {chat.title}</b>\n\n"
        f"👥 الأعضاء: <b>{member_count}</b>\n"
        f"💬 الرسائل المسجلة: <b>{total_msgs:,}</b>\n"
        f"📝 المستخدمين النشطين: <b>{total_users}</b>\n"
        f"⚡ الردود السريعة: <b>{total_replies}</b>\n"
        f"📌 الملاحظات: <b>{total_notes}</b>"
    )
    await update.message.reply_html(text)


async def cmd_top(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """أنشط الأعضاء"""
    chat_id = update.effective_chat.id
    with get_db() as conn:
        cur = conn.execute(
            "SELECT first_name, username, message_count FROM user_stats WHERE chat_id = ? ORDER BY message_count DESC LIMIT 10",
            (chat_id,),
        )
        top_users = cur.fetchall()

    if not top_users:
        await update.message.reply_text("📭 لا توجد بيانات بعد.")
        return

    text = "🏆 <b>أنشط الأعضاء:</b>\n\n"
    medals = ["🥇", "🥈", "🥉"]
    for i, u in enumerate(top_users):
        emoji = medals[i] if i < 3 else f"{i+1}."
        name = u["first_name"] or "Unknown"
        text += f"{emoji} <b>{name}</b> — {u['message_count']:,} رسالة\n"

    await update.message.reply_html(text)


async def cmd_info(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معلومات المستخدم"""
    target = (
        update.message.reply_to_message.from_user
        if update.message.reply_to_message
        else update.effective_user
    )

    with get_db() as conn:
        stats = conn.execute(
            "SELECT message_count, last_seen FROM user_stats WHERE chat_id = ? AND user_id = ?",
            (update.effective_chat.id, target.id),
        ).fetchone()

    msg_count = stats["message_count"] if stats else 0
    last_seen = stats["last_seen"][:16] if stats else "غير معروف"

    text = (
        f"👤 <b>معلومات المستخدم</b>\n\n"
        f"📛 الاسم: <b>{target.full_name}</b>\n"
        f"🆔 المعرف: <code>{target.id}</code>\n"
        f"🔤 اليوزر: @{target.username or 'لا يوجد'}\n"
        f"🤖 بوت: {'نعم' if target.is_bot else 'لا'}\n"
        f"💬 الرسائل: <b>{msg_count:,}</b>\n"
        f"🕐 آخر ظهور: {last_seen}"
    )
    await update.message.reply_html(text)


async def cmd_id(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معرفات المستخدم والمجموعة"""
    user = update.effective_user
    chat = update.effective_chat

    text = f"🆔 معرفك: <code>{user.id}</code>"
    if chat.type != ChatType.PRIVATE:
        text += f"\n📢 معرف المجموعة: <code>{chat.id}</code>"
    if update.message.reply_to_message:
        target = update.message.reply_to_message.from_user
        text += f"\n👤 معرف المستخدم: <code>{target.id}</code>"

    await update.message.reply_html(text)


# ================== المعالجات التلقائية ==================

# تتبع آخر رسائل المستخدمين لمكافحة الفيضان
flood_cache: Dict[tuple, List[float]] = {}
FLOOD_THRESHOLD = 5  # 5 رسائل
FLOOD_WINDOW = 7  # خلال 7 ثواني


async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معالج جميع الرسائل"""
    if not update.message or not update.effective_chat:
        return

    chat = update.effective_chat
    user = update.effective_user
    text = update.message.text or ""

    if chat.type == ChatType.PRIVATE:
        return

    chat_id = chat.id
    register_chat(chat_id, chat.title or "", chat.type)

    # تحديث الإحصائيات
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO user_stats (chat_id, user_id, username, first_name, message_count, last_seen)
            VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(chat_id, user_id) DO UPDATE SET
                message_count = message_count + 1,
                last_seen = CURRENT_TIMESTAMP,
                username = excluded.username,
                first_name = excluded.first_name
            """,
            (chat_id, user.id, user.username or "", user.first_name or ""),
        )

        # جلب إعدادات المجموعة
        settings = conn.execute(
            "SELECT * FROM chats WHERE chat_id = ?", (chat_id,)
        ).fetchone()

    if not settings:
        return

    # تجاهل المشرفين في الفلاتر
    is_admin = await is_user_admin(update)

    # === مكافحة الفيضان ===
    if settings["antiflood_enabled"] and not is_admin:
        key = (chat_id, user.id)
        now = datetime.now().timestamp()
        if key not in flood_cache:
            flood_cache[key] = []
        flood_cache[key].append(now)
        flood_cache[key] = [t for t in flood_cache[key] if now - t < FLOOD_WINDOW]

        if len(flood_cache[key]) >= FLOOD_THRESHOLD:
            try:
                await chat.restrict_member(
                    user.id,
                    permissions=ChatPermissions(can_send_messages=False),
                    until_date=datetime.now() + timedelta(minutes=5),
                )
                await update.message.reply_html(
                    f"🚫 تم كتم <b>{user.full_name}</b> 5 دقائق بسبب الفيضان."
                )
                flood_cache[key] = []
            except Exception as e:
                logger.error(f"Antiflood error: {e}")
            return

    # === مكافحة الروابط ===
    if settings["antilink_enabled"] and not is_admin:
        link_pattern = r"(https?://|t\.me/|telegram\.me/|www\.)"
        if re.search(link_pattern, text, re.IGNORECASE):
            try:
                await update.message.delete()
                warn = await context.bot.send_message(
                    chat_id,
                    f"🚫 {user.mention_html()} الروابط غير مسموحة!",
                    parse_mode=ParseMode.HTML,
                )
                await asyncio.sleep(5)
                await warn.delete()
            except Exception:
                pass
            return

    # === الكلمات المحظورة ===
    with get_db() as conn:
        banned = conn.execute(
            "SELECT word FROM banned_words WHERE chat_id = ?", (chat_id,)
        ).fetchall()

    if banned and not is_admin:
        text_lower = text.lower()
        for row in banned:
            if row["word"] in text_lower:
                try:
                    await update.message.delete()
                    warn = await context.bot.send_message(
                        chat_id,
                        f"⚠️ {user.mention_html()} كلمة محظورة!",
                        parse_mode=ParseMode.HTML,
                    )
                    await asyncio.sleep(5)
                    await warn.delete()
                except Exception:
                    pass
                return

    # === الردود السريعة ===
    if text and not text.startswith("/"):
        text_lower = text.lower().strip()
        with get_db() as conn:
            # البحث عن تطابق
            replies = conn.execute(
                "SELECT trigger, response FROM quick_replies WHERE chat_id = ?",
                (chat_id,),
            ).fetchall()

            for r in replies:
                if r["trigger"] in text_lower:
                    await update.message.reply_text(r["response"])
                    conn.execute(
                        "UPDATE quick_replies SET use_count = use_count + 1 WHERE chat_id = ? AND trigger = ?",
                        (chat_id, r["trigger"]),
                    )
                    break

    # === استرجاع الملاحظات بـ # ===
    if text.startswith("#"):
        note_name = text[1:].split()[0].lower()
        with get_db() as conn:
            note = conn.execute(
                "SELECT content FROM notes WHERE chat_id = ? AND note_name = ?",
                (chat_id, note_name),
            ).fetchone()
        if note:
            await update.message.reply_text(note["content"])


async def welcome_new_member(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """ترحيب بالأعضاء الجدد"""
    if not update.message or not update.message.new_chat_members:
        return

    chat = update.effective_chat
    chat_id = chat.id

    with get_db() as conn:
        settings = conn.execute(
            "SELECT welcome_enabled, welcome_message FROM chats WHERE chat_id = ?",
            (chat_id,),
        ).fetchone()

    if not settings or not settings["welcome_enabled"]:
        return

    try:
        member_count = await chat.get_member_count()
    except Exception:
        member_count = 0

    for new_member in update.message.new_chat_members:
        if new_member.is_bot:
            continue

        custom_msg = settings["welcome_message"]
        if custom_msg:
            msg = (
                custom_msg.replace("{name}", new_member.full_name)
                .replace("{username}", f"@{new_member.username}" if new_member.username else new_member.full_name)
                .replace("{chat}", chat.title or "")
                .replace("{count}", str(member_count))
            )
        else:
            msg = (
                f"👋 أهلاً بك يا <b>{new_member.full_name}</b>\n"
                f"في مجموعة <b>{chat.title}</b>\n"
                f"أنت العضو رقم <b>{member_count}</b> 🎉\n\n"
                f"📜 اكتب /rules لعرض القواعد"
            )

        try:
            await update.message.reply_html(msg)
        except Exception as e:
            logger.error(f"Welcome error: {e}")


async def goodbye_member(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """وداع المغادرين"""
    if not update.message or not update.message.left_chat_member:
        return

    member = update.message.left_chat_member
    if member.is_bot:
        return

    try:
        await update.message.reply_html(
            f"👋 وداعاً <b>{member.full_name}</b>"
        )
    except Exception:
        pass


# ================== ويب سيرفر للحفاظ على البوت نشطاً ==================

async def health_check(request):
    """نقطة فحص صحة البوت"""
    return web.json_response({"status": "alive", "bot": "running"})


async def webhook_handler(request, application):
    """معالج webhook من تيليجرام"""
    data = await request.json()
    update = Update.de_json(data, application.bot)
    await application.process_update(update)
    return web.Response(text="OK")


async def start_web_server(application: Application):
    """تشغيل خادم الويب"""
    app = web.Application()
    app.router.add_get("/", health_check)
    app.router.add_get("/health", health_check)

    if WEBHOOK_URL:
        async def handler(request):
            return await webhook_handler(request, application)
        app.router.add_post(f"/webhook/{BOT_TOKEN}", handler)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info(f"🌐 الخادم يعمل على المنفذ {PORT}")


# ================== التشغيل الرئيسي ==================

async def setup_commands(application: Application):
    """تعيين أوامر البوت في القائمة"""
    commands = [
        BotCommand("start", "🚀 بدء البوت"),
        BotCommand("help", "📚 المساعدة"),
        BotCommand("rules", "📜 قواعد المجموعة"),
        BotCommand("stats", "📊 إحصائيات المجموعة"),
        BotCommand("top", "🏆 أنشط الأعضاء"),
        BotCommand("info", "👤 معلومات المستخدم"),
        BotCommand("id", "🆔 المعرفات"),
        BotCommand("replies", "⚡ الردود السريعة"),
        BotCommand("topreplies", "🔥 الأكثر استخداماً"),
        BotCommand("notes", "📝 الملاحظات"),
    ]
    await application.bot.set_my_commands(commands)


async def post_init(application: Application):
    """يعمل بعد تهيئة البوت"""
    await setup_commands(application)
    await start_web_server(application)

    if WEBHOOK_URL:
        webhook_url = f"{WEBHOOK_URL}/webhook/{BOT_TOKEN}"
        await application.bot.set_webhook(url=webhook_url, drop_pending_updates=True)
        logger.info(f"✅ Webhook مضبوط: {webhook_url}")
    else:
        logger.info("ℹ️ يعمل في وضع Polling")


def main():
    """نقطة البداية"""
    if not BOT_TOKEN:
        logger.error("❌ BOT_TOKEN غير معرّف! ضعه في متغيرات البيئة.")
        return

    init_database()

    application = (
        Application.builder()
        .token(BOT_TOKEN)
        .post_init(post_init)
        .build()
    )

    # === تسجيل الأوامر ===
    # أوامر البداية
    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("help", cmd_help))

    # أوامر الإدارة
    application.add_handler(CommandHandler("ban", cmd_ban))
    application.add_handler(CommandHandler("unban", cmd_unban))
    application.add_handler(CommandHandler("mute", cmd_mute))
    application.add_handler(CommandHandler("unmute", cmd_unmute))
    application.add_handler(CommandHandler("kick", cmd_kick))
    application.add_handler(CommandHandler("warn", cmd_warn))
    application.add_handler(CommandHandler("warns", cmd_warns))
    application.add_handler(CommandHandler("resetwarns", cmd_resetwarns))
    application.add_handler(CommandHandler("pin", cmd_pin))
    application.add_handler(CommandHandler("unpin", cmd_unpin))
    application.add_handler(CommandHandler("purge", cmd_purge))

    # الردود السريعة
    application.add_handler(CommandHandler("addreply", cmd_addreply))
    application.add_handler(CommandHandler("delreply", cmd_delreply))
    application.add_handler(CommandHandler("replies", cmd_replies))
    application.add_handler(CommandHandler("topreplies", cmd_topreplies))

    # الملاحظات
    application.add_handler(CommandHandler("save", cmd_save))
    application.add_handler(CommandHandler("get", cmd_get))
    application.add_handler(CommandHandler("notes", cmd_notes))
    application.add_handler(CommandHandler("delnote", cmd_delnote))

    # القواعد
    application.add_handler(CommandHandler("setrules", cmd_setrules))
    application.add_handler(CommandHandler("rules", cmd_rules))

    # الكلمات المحظورة
    application.add_handler(CommandHandler("addword", cmd_addword))
    application.add_handler(CommandHandler("delword", cmd_delword))
    application.add_handler(CommandHandler("words", cmd_words))

    # الإعدادات
    application.add_handler(CommandHandler("setwelcome", cmd_setwelcome))
    application.add_handler(
        CommandHandler(
            ["welcome", "antilink", "antiflood", "antispam", "nightmode"],
            cmd_toggle_setting,
        )
    )

    # الإحصائيات
    application.add_handler(CommandHandler("stats", cmd_stats))
    application.add_handler(CommandHandler("top", cmd_top))
    application.add_handler(CommandHandler("info", cmd_info))
    application.add_handler(CommandHandler("id", cmd_id))

    # الأزرار
    application.add_handler(CallbackQueryHandler(callback_handler))

    # المعالجات التلقائية
    application.add_handler(
        MessageHandler(
            filters.StatusUpdate.NEW_CHAT_MEMBERS, welcome_new_member
        )
    )
    application.add_handler(
        MessageHandler(filters.StatusUpdate.LEFT_CHAT_MEMBER, goodbye_member)
    )
    application.add_handler(
        MessageHandler(
            filters.TEXT & ~filters.COMMAND, message_handler
        )
    )

    logger.info("🚀 البوت يبدأ العمل...")

    if WEBHOOK_URL:
        # في وضع Webhook نتركه يعمل بشكل مستمر
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(application.initialize())
        loop.run_until_complete(application.start())
        loop.run_until_complete(post_init(application))
        try:
            loop.run_forever()
        except KeyboardInterrupt:
            loop.run_until_complete(application.stop())
            loop.run_until_complete(application.shutdown())
    else:
        # وضع Polling - الأنسب لـ Render Free
        application.run_polling(drop_pending_updates=True, allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
