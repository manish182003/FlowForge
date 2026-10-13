# DSA Guide: Cycle Detection in Workflows

## 1. Why Cycles Break Distributed Schedulers
A cycle occurs when a chain of task dependencies forms a loop:
$$A \longrightarrow B \longrightarrow C \longrightarrow A$$
- Task $A$ cannot start until $C$ finishes.
- Task $C$ cannot start until $B$ finishes.
- Task $B$ cannot start until $A$ finishes.

If a user submits this workflow to a scheduler without cycle detection:
1. None of the tasks in the cycle ever reach an in-degree of 0.
2. The workers sit idle.
3. The workflow hangs indefinitely in an unresolved state, leaking database records and queue leases.

---

## 2. Why Kahn's Algorithm Detects Cycles
In Kahn's algorithm:
- Only nodes with `inDegree == 0` can enter the queue.
- When nodes are processed, they "remove" outgoing edges and reduce the in-degree of their neighbors.
- In any directed cycle, **every single node in the cycle has an in-degree of at least 1**.
- Therefore, **no node inside the cycle can ever reach in-degree 0**.
- They are permanently trapped and cannot enter the queue.
- If `processedCount < totalTasks`, the difference represents nodes trapped in cycles!

---

## 3. C++ vs. JavaScript Code Comparison

### In C++:
```cpp
#include <vector>
#include <queue>
#include <unordered_map>
#include <string>

struct CycleResult {
    bool hasCycle;
    std::vector<std::string> trappedNodes;
};

CycleResult detectCycle(
    const std::vector<std::string>& taskIds,
    const std::unordered_map<std::string, std::vector<std::string>>& adj,
    std::unordered_map<std::string, int> inDegree
) {
    std::queue<std::string> q;
    for (const auto& id : taskIds) {
        if (inDegree[id] == 0) q.push(id);
    }

    int processed = 0;
    while (!q.empty()) {
        std::string u = q.front();
        q.pop();
        processed++;

        for (const std::string& v : adj.at(u)) {
            inDegree[v]--;
            if (inDegree[v] == 0) q.push(v);
        }
    }

    bool hasCycle = (processed < taskIds.size());
    std::vector<std::string> trapped;
    if (hasCycle) {
        for (const auto& id : taskIds) {
            if (inDegree[id] > 0) trapped.push_back(id);
        }
    }
    return { hasCycle, trapped };
}
```

### In JavaScript (FlowForge Engine):
```javascript
function detectCycle(tasks) {
  const { adj, inDegree, taskIds } = buildGraphRepresentation(tasks);
  const inDegreeCopy = new Map(inDegree);
  const queue = [];

  for (const taskId of taskIds) {
    if (inDegreeCopy.get(taskId) === 0) queue.push(taskId);
  }

  let processedCount = 0;
  let head = 0;

  while (head < queue.length) {
    const u = queue[head++];
    processedCount++;

    for (const v of adj.get(u) || []) {
      const remaining = inDegreeCopy.get(v) - 1;
      inDegreeCopy.set(v, remaining);
      if (remaining === 0) queue.push(v);
    }
  }

  const hasCycle = processedCount < taskIds.length;
  const cycleNodes = hasCycle
    ? taskIds.filter(id => (inDegreeCopy.get(id) || 0) > 0)
    : [];

  return { hasCycle, cycleNodes };
}
```

---

## 4. Alternative: 3-Color DFS (Tarjan / White-Gray-Black)
In competitive programming, you may also see DFS cycle detection:
- `WHITE` (0): Unvisited node.
- `GRAY` (1): Currently in the active recursion call stack.
- `BLACK` (2): Fully visited and backtracking complete.

If DFS encounters a neighbor colored `GRAY`, a **back-edge** exists, proving a cycle!
Kahn's BFS is preferred in production schedulers because it also produces the topological ordering simultaneously in $O(V + E)$ without recursion stack overflow risks on deep graphs.
