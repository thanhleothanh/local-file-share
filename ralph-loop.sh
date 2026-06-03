#!/bin/bash

# Stop on critical failures within the loop setup
set -e

for ((i=1; i<=100; i++)); do
    echo "----------------------------------------"
    echo "Iteration $i/100..."
    echo "----------------------------------------"
    
    set +e
    vibe --prompt "Explore the codebase, and documentations (careful on what was marked Superseded, those should be deprecated) in .docs if not already done. Work on the next grabbable issues or criterion in .docs/issues/ folder with `/tdd` and `/solid-skill`, should consider the blockers and dependency to see which need to be worked on first/next, only work on AFK issues that are ready to be worked on. After the criterions are done, mark them as done. If the issue was only partially done, update the progress and status in the issue file. Commit to git with commit message on what was implemented after meaningful work is done and criterion is marked as done (no need to be a full issue) and verified that it works with tests. After the commit should finish the iteration and start the next one, if there is a need to do more work on the same issue, it can be done in the next iteration. If there is a need to switch to another issue, it can be done in the next iteration as well. The main goal is to make meaningful progress on the issues and not to rush through them. Remember to take breaks and stay hydrated! After 100 iterations, if the finish token is not detected in the git log, it should still suspend the machine for safety."
    
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
