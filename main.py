"""
main.py — نقطة الدخول الرئيسية
يشغّل سيرفر keep-alive ثم يبدأ البوت
"""

import asyncio
import os
import logging
from keep_alive import keep_alive

logging.basicConfig(level=logging.INFO)

# تشغيل سيرفر Flask في خيط منفصل
keep_alive()

# تشغيل البوت
from bot import main
asyncio.run(main())
