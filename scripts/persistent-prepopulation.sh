#!/bin/bash

TARGET_ENTRIES=${1:-100}
LOG_FILE="/tmp/prepopulation_$(date +%Y%m%d_%H%M%S).log"

echo "🎯 Starting persistent prepopulation for $TARGET_ENTRIES entries"
echo "📝 Logging to: $LOG_FILE"

check_progress() {
    # Use curl to query the database via a simple endpoint
    COUNT=$(curl -s "http://localhost:5000/api/game/session" 2>/dev/null | grep -o '"id":[0-9]*' | wc -l 2>/dev/null || echo "0")
    # Fallback: count processed entries differently if needed
    echo "Checking database status..."
}

run_prepopulation() {
    echo "🚀 $(date): Starting prepopulation script..."
    npx tsx scripts/prepopulate-wikipedia-data.ts >> $LOG_FILE 2>&1 &
    SCRIPT_PID=$!
    echo "Started with PID: $SCRIPT_PID"
    return $SCRIPT_PID
}

monitor_and_restart() {
    local target=$1
    local check_interval=30
    local max_stall_time=300  # 5 minutes
    local last_count=0
    local stall_count=0
    
    while true; do
        # Check if script is running
        if ! pgrep -f "prepopulate-wikipedia-data" > /dev/null; then
            echo "⚠️ $(date): Script not running, restarting..."
            run_prepopulation
        fi
        
        # Check progress every 30 seconds
        sleep $check_interval
        
        # Get current processed count (simplified check)
        echo "📊 $(date): Monitoring progress..."
        tail -5 $LOG_FILE 2>/dev/null | grep "Successfully processed" | tail -1
        
        # Check if we should continue monitoring
        if [ -f "/tmp/stop_monitoring" ]; then
            echo "🛑 Stop signal received, ending monitoring"
            pkill -f "prepopulate-wikipedia-data"
            break
        fi
        
        echo "🔄 $(date): Continuing monitoring cycle..."
    done
}

# Create stop signal cleanup
trap 'echo "🧹 Cleaning up..."; pkill -f "prepopulate-wikipedia-data"; rm -f /tmp/stop_monitoring; exit' EXIT

# Start initial script
run_prepopulation

# Start monitoring
monitor_and_restart $TARGET_ENTRIES

echo "✅ Monitoring completed for target: $TARGET_ENTRIES entries"