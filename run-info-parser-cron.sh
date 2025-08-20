#!/bin/bash

# Cron wrapper script for info-parser.js
# This ensures proper environment setup when running via cron

# Set the working directory to the script location
cd "$(dirname "$0")"

# Set up environment variables that cron might be missing
export HOME="/home/ubuntu"
export USER="ubuntu"
export SHELL="/bin/bash"
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin"
export DISPLAY=":99"
export NODE_ENV="production"

# Set up X11 virtual display (required for Chromium even in headless mode)
export XVFB_WHD="1920x1080x24"

# Ensure temp directory exists and has proper permissions
mkdir -p /home/ubuntu/temp
chmod 755 /home/ubuntu/temp

# Clean up any stale Chromium processes from previous runs
pkill -f chromium || true
pkill -f chrome || true

# Clean up temp directory of any browser locks
rm -rf /home/ubuntu/temp/.org.chromium.Chromium.* 2>/dev/null || true
rm -rf /home/ubuntu/temp/SingletonLock 2>/dev/null || true

# Start Xvfb (virtual display) if not already running
if ! pgrep -x "Xvfb" > /dev/null; then
    Xvfb :99 -screen 0 $XVFB_WHD -ac +extension GLX +render -noreset > /dev/null 2>&1 &
    sleep 2
fi

# Log the start of the cron job
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting bankruptcy processing script via cron"

# Run the Node.js script with proper error handling
/usr/bin/node info-parser.js 2>&1

# Capture the exit code
EXIT_CODE=$?

# Clean up after execution
pkill -f chromium || true
rm -rf /home/ubuntu/temp/.org.chromium.Chromium.* 2>/dev/null || true

# Log completion
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bankruptcy processing script completed with exit code: $EXIT_CODE"

exit $EXIT_CODE