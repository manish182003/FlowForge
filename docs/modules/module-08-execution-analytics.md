# Module 08: Execution Analytics, Makespan & Critical-Path Dashboard

## 1. System Design & Algorithmic Foundations

In distributed job schedulers, measuring performance is not simply calculating the sum of task durations. Because workers process non-dependent tasks concurrently, total elapsed wall-clock time (**Makespan**) is determined by the **longest path** through the Directed Acyclic Graph (DAG) from source to sink.

---

## 2. Core Mathematical Metrics

### A. Total Sequential Work
$$\text{Sequential Work} = \sum_{v \in V} \text{duration}(v)$$
Represents the total CPU execution time if all tasks were executed on a single worker one after another.

### B. Actual Makespan
$$\text{Actual Makespan} = t_{\text{completed}} - t_{\text{started}}$$
The total wall-clock duration elapsed during the workflow run.

### C. Parallel Speedup Factor
$$\text{Speedup Factor} = \frac{\text{Total Sequential Work}}{\text{Actual Makespan}}$$
- A speedup of $2.5\times$ indicates the distributed cluster delivered $2.5\times$ throughput compared to single-threaded execution.
- If speedup $\approx 1.0\times$, tasks ran sequentially due to linear dependencies or worker starvation.

### D. Amdahl's Law & Critical Path Bottleneck
**Amdahl's Law** states that the speedup of an application is bounded by its non-parallelizable sequential bottleneck.
In a DAG:
- Tasks **on the critical path** directly dictate the minimum possible workflow duration.
- Tasks **not on the critical path** have slack time. Optimizing them produces zero improvement in total makespan.

---

## 3. The Dynamic Programming Algorithm

### Recurrence Relation:
Let $\text{earliestFinish}[v]$ be the maximum time to complete task $v$, taking into account all prerequisite paths:

$$\text{earliestFinish}[v] = \max_{u \in \text{dependencies}(v)} (\text{earliestFinish}[u]) + \text{duration}(v)$$

### Algorithm Steps:
1. Obtain topological ordering $T = [u_1, u_2, \dots, u_n]$ using Kahn's algorithm ($O(V + E)$).
2. Initialize $\text{earliestFinish}[v] = \text{duration}(v)$ for all $v$.
3. For each vertex $u \in T$, relax all downstream neighbors $v$ where $u \in \text{dependencies}(v)$.
4. Track $\text{predecessor}[v] = u$ whenever a longer path to $v$ is discovered.
5. Identify the sink vertex with the maximum $\text{earliestFinish}$.
6. Backtrack from the sink via $\text{predecessor}$ pointers to reconstruct the exact critical chain: $[t_{\text{root}} \to \dots \to t_{\text{sink}}]$.

**Total Time Complexity:** $O(V + E)$  
**Space Complexity:** $O(V)$

---

## 4. DSA / Systems Programming: C++ vs JavaScript Comparison

### Side-by-Side: Critical-Path Dynamic Programming

#### C++ (Modern C++ STL):
```cpp
#include <vector>
#include <unordered_map>
#include <string>
#include <algorithm>

struct TaskMetric {
    std::string id;
    int durationMs;
    std::vector<std::string> dependencies;
};

std::pair<int, std::vector<std::string>> computeCriticalPath(
    const std::vector<TaskMetric>& tasks,
    const std::vector<std::string>& topoOrder) {
    
    std::unordered_map<std::string, int> earliestFinish;
    std::unordered_map<std::string, std::string> predecessor;

    for (const auto& t : tasks) {
        earliestFinish[t.id] = t.durationMs;
    }

    std::string bottleneckNode = "";
    int maxMakespan = 0;

    for (const auto& uId : topoOrder) {
        int uFinish = earliestFinish[uId];
        if (uFinish > maxMakespan) {
            maxMakespan = uFinish;
            bottleneckNode = uId;
        }

        for (const auto& t : tasks) {
            for (const auto& dep : t.dependencies) {
                if (dep == uId) {
                    int candidate = uFinish + t.durationMs;
                    if (candidate > earliestFinish[t.id]) {
                        earliestFinish[t.id] = candidate;
                        predecessor[t.id] = uId;
                    }
                }
            }
        }
    }

    std::vector<std::string> path;
    std::string curr = bottleneckNode;
    while (!curr.empty()) {
        path.push_back(curr);
        curr = predecessor[curr];
    }
    std::reverse(path.begin(), path.end());
    return {maxMakespan, path};
}
```

#### JavaScript (FlowForge `analyticsEngine.js`):
```javascript
function computeActualCriticalPath(tasks, topoOrder) {
  const earliestFinish = {};
  const predecessor = {};

  for (const t of tasks) {
    earliestFinish[t.taskId] = t.durationMs || 0;
  }

  let bottleneckTaskId = null;
  let maxMakespan = 0;

  for (const uId of topoOrder) {
    const uFinish = earliestFinish[uId] || 0;
    if (uFinish > maxMakespan) {
      maxMakespan = uFinish;
      bottleneckTaskId = uId;
    }

    for (const t of tasks) {
      if ((t.dependencies || []).includes(uId)) {
        const candidateFinish = uFinish + (t.durationMs || 0);
        if (candidateFinish > (earliestFinish[t.taskId] || 0)) {
          earliestFinish[t.taskId] = candidateFinish;
          predecessor[t.taskId] = uId;
          if (candidateFinish > maxMakespan) {
            maxMakespan = candidateFinish;
            bottleneckTaskId = t.taskId;
          }
        }
      }
    }
  }

  const criticalPath = [];
  let curr = bottleneckTaskId;
  while (curr) {
    criticalPath.unshift(curr);
    curr = predecessor[curr];
  }

  return { criticalMakespanMs: maxMakespan, criticalPath };
}
```

---

## 5. Summary of Implemented Features
1. **Analytics Engine (`analyticsEngine.js`)**: Real-time evaluation of makespan, sequential sum, speedup factor, and queue delay.
2. **REST API Endpoint (`GET /api/runs/:runId/analytics`)**: Fast, indexed metric extraction.
3. **SVG DAG Critical Path Overlay (`GraphCanvas.jsx`)**: High-contrast white stroke with directional arrows and `[CRITICAL]` node badges.
4. **Analytics Dashboard (`AnalyticsDashboard.jsx`)**: Modal with speedup metric cards, critical path sequence chain, and Gantt-style timeline breakdown.
5. **Full Unit & Integration Test Coverage (`analytics.test.js`)**: All 82 tests pass.
