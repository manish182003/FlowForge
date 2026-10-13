# DSA Guide: Topological Sorting (Kahn's Algorithm)

## 1. The Core Problem
In a workflow scheduler, tasks cannot be executed in arbitrary order. If:
- Task $B$ depends on Task $A$
- Task $C$ depends on Task $B$

Then the scheduler **must** complete $A$ before $B$, and $B$ before $C$.
A **Topological Sort** is a linear ordering of all vertices in a directed graph such that for every directed edge $u \longrightarrow v$, vertex $u$ comes before vertex $v$.

---

## 2. Kahn's Algorithm (BFS with In-Degrees)

### How It Works Step-by-Step:
1. **Compute In-Degrees**: Count how many prerequisites each task has.
2. **Seed the Queue**: Enqueue all tasks with `inDegree == 0` (tasks with 0 prerequisites can run immediately).
3. **Process BFS Queue**:
   - Dequeue task $u$, add it to the final `order`.
   - For every neighbor $v$ that depends on $u$:
     - Decrement $v$'s in-degree: `inDegree[v]--`.
     - If $v$'s in-degree reaches `0` (all its prerequisites have finished!), enqueue $v$.
4. **Cycle Detection Check**: If `order.length < total_tasks`, a cycle exists!

---

## 3. C++ vs. JavaScript Code Comparison

### In C++:
```cpp
#include <vector>
#include <queue>
#include <unordered_map>
#include <stdexcept>

std::vector<std::string> topologicalSort(
    const std::vector<std::string>& taskIds,
    const std::unordered_map<std::string, std::vector<std::string>>& adj,
    std::unordered_map<std::string, int> inDegree
) {
    std::queue<std::string> q;
    for (const auto& id : taskIds) {
        if (inDegree[id] == 0) q.push(id);
    }

    std::vector<std::string> order;
    while (!q.empty()) {
        std::string u = q.front();
        q.pop();
        order.push_back(u);

        for (const std::string& v : adj.at(u)) {
            inDegree[v]--;
            if (inDegree[v] == 0) q.push(v);
        }
    }

    if (order.size() < taskIds.size()) {
        throw std::runtime_error("Cycle detected in graph!");
    }
    return order;
}
```

### In JavaScript (FlowForge Engine):
```javascript
function topologicalSort(tasks) {
  const { adj, inDegree, taskIds } = buildGraphRepresentation(tasks);
  const inDegreeCopy = new Map(inDegree);
  const queue = [];

  // Enqueue root tasks (0 prerequisites)
  for (const taskId of taskIds) {
    if (inDegreeCopy.get(taskId) === 0) {
      queue.push(taskId);
    }
  }

  const order = [];
  let head = 0; // O(1) dequeue pointer

  while (head < queue.length) {
    const u = queue[head++];
    order.push(u);

    for (const v of adj.get(u) || []) {
      const remaining = inDegreeCopy.get(v) - 1;
      inDegreeCopy.set(v, remaining);
      if (remaining === 0) {
        queue.push(v);
      }
    }
  }

  if (order.length < taskIds.length) {
    throw new Error("Cycle detected in workflow graph!");
  }
  return order;
}
```

---

## 4. Complexity & Interview Defenses
- **Time Complexity**: $\mathcal{O}(V + E)$
  - Every vertex is enqueued and dequeued at most once: $\mathcal{O}(V)$.
  - Every edge is traversed once when decrementing in-degree: $\mathcal{O}(E)$.
  - Total time: $\mathcal{O}(V + E)$.
- **Space Complexity**: $\mathcal{O}(V + E)$ for the adjacency list, in-degree map, and queue.
