#!/bin/bash
set -e

mkdir -p test_assets

# 1. Standard WebM
echo "Generating standard.webm..."
ffmpeg -y -f lavfi -i "testsrc=duration=10:size=1280x720:rate=30" \
       -f lavfi -i "sine=frequency=1000:duration=10" \
       -c:v libvpx-vp9 -b:v 1M \
       -c:a libopus \
       -f webm \
       test_assets/standard.webm

# 2. Live WebM (No Duration)
echo "Generating live_no_duration.webm..."
ffmpeg -y -f lavfi -i "testsrc=duration=10:size=1280x720:rate=30" \
       -f lavfi -i "sine=frequency=1000:duration=10" \
       -c:v libvpx-vp9 -b:v 1M \
       -c:a libopus \
       -live 1 \
       -f webm \
       test_assets/live_no_duration.webm

# 3. Audio Only WebM
echo "Generating audio_only.webm..."
ffmpeg -y -f lavfi -i "sine=frequency=1000:duration=10" \
       -c:a libopus \
       -vn \
       -f webm \
       test_assets/audio_only.webm

# 4. Truncated WebM
echo "Generating truncated.webm..."
# First create a temp file
ffmpeg -y -f lavfi -i "testsrc=duration=10:size=1280x720:rate=30" -c:v libvpx-vp9 -f webm test_assets/temp.webm

# Truncate last 10KB
FILE_SIZE=$(wc -c < test_assets/temp.webm)
TRUNCATED_SIZE=$(($FILE_SIZE - 10240))
head -c $TRUNCATED_SIZE test_assets/temp.webm > test_assets/truncated.webm

# Remove temp
rm test_assets/temp.webm

echo "All assets generated in test_assets/"
