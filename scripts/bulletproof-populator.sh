#!/bin/bash

TARGET=${1:-9372}
LOG_FILE="/tmp/bulletproof_$(date +%Y%m%d_%H%M%S).log"

echo "🔥 BULLETPROOF POPULATOR STARTED - Target: $TARGET entries" | tee -a $LOG_FILE
echo "📝 Logging to: $LOG_FILE" | tee -a $LOG_FILE

while true; do
    # Get current count from database
    CURRENT=$(curl -s "http://localhost:5000/api/game/session" 2>/dev/null | grep -c '"id"' || echo "0")
    
    echo "$(date '+%H:%M:%S') - Current entries: $CURRENT/$TARGET" | tee -a $LOG_FILE
    
    # Check if we've reached our target
    if [ "$CURRENT" -ge "$TARGET" ]; then
        echo "🎉 TARGET REACHED! $CURRENT entries completed." | tee -a $LOG_FILE
        break
    fi
    
    # Kill any existing scripts to prevent conflicts
    pkill -f "prepopulate-wikipedia-data" 2>/dev/null
    sleep 2
    
    # Start the prepopulation script
    echo "$(date '+%H:%M:%S') - Starting prepopulation script..." | tee -a $LOG_FILE
    timeout 180 npx tsx scripts/prepopulate-wikipedia-data.ts >> $LOG_FILE 2>&1 &
    SCRIPT_PID=$!
    
    # Wait for script to run, then restart it
    sleep 120
    
    # Check if script is still running
    if kill -0 $SCRIPT_PID 2>/dev/null; then
        echo "$(date '+%H:%M:%S') - Script still running, letting it continue..." | tee -a $LOG_FILE
        wait $SCRIPT_PID
    else
        echo "$(date '+%H:%M:%S') - Script finished, restarting..." | tee -a $LOG_FILE
    fi
    
    # Brief pause before restart
    sleep 5
done

echo "✅ BULLETPROOF POPULATOR COMPLETED!" | tee -a $LOG_FILE