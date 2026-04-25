#!/usr/bin/env bash
# تحديث النظام وتثبيت FFmpeg الضروري لمعالجة الصوتيات
apt-get update && apt-get install -y ffmpeg

# تثبيت حزم بايثون
pip install -r requirements.txt
