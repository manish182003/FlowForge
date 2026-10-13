# DSA Guide: Critical Path Method (CPM) using Dynamic Programming

## 1. What is Critical Path Analysis?
When running a workflow with parallel workers:
- **Sequential Execution Time**: The simple sum of all task durations ($\sum \text{duration}(u)$).
- **Minimum Makespan**: The shortest theoretical time the workflow can finish if you had an infinite number of parallel workers.
- **The Critical Path**: The sequence of dependent tasks that takes the longest time from start to finish.
  - Any delay to a task on the critical path directly delays the entire workflow!
  - Tasks NOT on the critical path have "slack" (float time) and can be delayed without affecting the final completion time.

---

## 2. Dynamic Programming Formulation on DAGs

Because the workflow is guaranteed to be an acyclic graph (DAG), we can solve this in $\mathcal{O}(V + E)$ time using forward Dynamic Programming in **topological order**:

1. **State Definition**:
   - $\text{earliestStart}(u) = \max_{p \in \text{prereqs}(u)} (\text{earliestFinish}(p))$
     (If $u$ has no prerequisites, $\text{earliestStart}(u) = 0$).
   - $\text{earliestFinish}(u) = \text{earliestStart}(u) + \text{duration}(u)$.
2. **Backpointer Tracking**:
   - Record $\text{criticalPredecessor}(u) = \text{argmax}_{p} (\text{earliestFinish}(p))$ to backtrack and reconstruct the exact bottleneck path.
3. **Workflow Makespan**:
   $$\text{Makespan} = \max_{u \in V} (\text{earliestFinish}(u))$$

---

## 3. C++ vs. JavaScript Code Comparison

### In C++:
```cpp
#include <vector>
#include <string>
#include <unordered_map>
#include <algorithm>

struct DPState {
    int duration;
    int earliestStart;
    int earliestFinish;
    std::string criticalPredecessor;
};

std::vector<std::string> computeCriticalPath(
    const std::vector<std::string>& topoOrder,
    const std::unordered_map<std::string, std::vector<std::string>>& prereqs,
    const std::unordered_map<std::string, int>& durations
) {
    std::unordered_map<std::string, DPState> dp;
    int makespan = 0;
    std::string endNode = "";

    for (const auto& u : topoOrder) {
        int maxPrereq = 0;
        std::string pred = "";
        if (prereqs.count(u)) {
            for (const auto& p : prereqs.at(u)) {
                if (dp[p].earliestFinish > maxPrereq) {
                    maxPrereq = dp[p].earliestFinish;
                    pred = p;
                }
            }
        }
        int dur = durations.at(u);
        dp[u] = { dur, maxPrereq, maxPrereq + dur, pred };

        if (dp[u].earliestFinish > makespan) {
            makespan = dp[u].earliestFinish;
            endNode = u;
        }
    }

    std::vector<std::string> path;
    for (std::string curr = endNode; !curr.empty(); curr = dp[curr].criticalPredecessor) {
        path.push_back(curr);
    }
    std::reverse(path.begin(), path.end());
    return path;
}
```

### In JavaScript (FlowForge Engine):
```javascript
function calculateCriticalPath(tasks, durationMap = {}, defaultDuration = 10) {
  const topoOrder = topologicalSort(tasks);
  const scheduleTable = {};

  for (const taskId of topoOrder) {
    const task = tasks.find(t => t.taskId === taskId);
    const duration = durationMap[taskId] ?? defaultDuration;

    let maxPrereqFinish = 0;
    let criticalPredecessor = null;

    for (const prereqId of (task.dependencies || [])) {
      const prereq = scheduleTable[prereqId];
      if (prereq && prereq.earliestFinish > maxPrereqFinish) {
        maxPrereqFinish = prereq.earliestFinish;
        criticalPredecessor = prereqId;
      }
    }

    scheduleTable[taskId] = {
      duration,
      earliestStart: maxPrereqFinish,
      earliestFinish: maxPrereqFinish + duration,
      criticalPredecessor
    };
  }

  // Find end node with maximum earliestFinish and backtrack
  // ... (Full implementation in server/src/algorithms/criticalPath.js)
}
```

---

## 4. System Design Significance
In distributed systems:
- If a client complains *"Our pipeline takes 10 minutes to run, can we double our worker count from 4 to 8 to cut time in half?"*
- You can run **Critical Path Analysis**: If the critical path itself is 9 minutes long, adding 1,000 more workers will only save 1 minute. You must optimize the slowest task on the critical path instead!
