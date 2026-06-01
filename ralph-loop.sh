#!/bin/bash

# Stop on critical failures within the loop setup
set -e

for ((i=1; i<=100; i++)); do
    echo "----------------------------------------"
    echo "Iteration $i/100..."
    echo "----------------------------------------"
    
    set +e
    vibe --prompt "Take the next grabbable issues or issues criterion in .docs/issues/ folder, should consider the blockers and dependency to see which need to be worked on first/next, only work on AFK issues that are ready to be worked on. After the criterions are done, mark them as done. If the issue was only partially done, update the progress and status what still needs to be worked on. Commit to git with commit message on what was implemented after meaningful work is done and criterion is marked as done (no need to be a full issue) and verified that it works. When all AFK issues/criterion are done, then print <>FINISH VIBING<>"
    
    EXIT_CODE=$?
    set -e

    # Check if it crashed
    if [ $EXIT_CODE -ne 0 ]; then
        echo "❌ Error: vibe exited with code $EXIT_CODE. Aborting suspend for safety."
        break;
    fi

    # Check if finish token is in the latest git commit
    if git log -1 --pretty=%B | grep -q "FINISH VIBING"; then
        echo "🎉 Success: Finish token detected in git log."
        break
    fi

    # Check if there are any remaining AFK issues in the docs
    if ! grep -q "AFK" .docs/issues/* 2>/dev/null; then
        echo "🎉 Success: No more AFK issues found in .docs/issues/."
        break
    fi

    echo "Iteration $i finished. Starting next task..."
    sleep 2
done

# -----------------------------------------------------------------
# 💤 SUSPEND SEQUENCE
# -----------------------------------------------------------------
echo "----------------------------------------"
echo "🚀 All tasks completed successfully!"
echo "🔄 Preparing to suspend the machine in 100 seconds... Press Ctrl+C to cancel."
echo "----------------------------------------"

# Give yourself a 100-second window to cancel if you happen to be at the desk
sleep 100

echo "💤 Suspending Ubuntu now..."
systemctl suspend
