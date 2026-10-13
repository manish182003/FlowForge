# DSA Guide: Directed Graph Representation in FlowForge

## 1. What is a Workflow Graph?
In FlowForge, a workflow is modeled as a **Directed Acyclic Graph (DAG)**:
- **Vertices (Nodes)**: Individual tasks (e.g., `download_csv`, `validate_data`, `generate_pdf`).
- **Directed Edges**: Dependency relationships. If Task B requires Task A to finish first, we have a directed edge:
  $$A \longrightarrow B$$
  Here:
  - $A$ is the **prerequisite** (tail/source).
  - $B$ is the **dependent** (head/target).
  - $B$'s **in-degree** increases by 1.

---

## 2. Adjacency Matrix vs. Adjacency List: The System Design Choice

| Representation | Space Complexity | Checking Edge ($u \to v$) | Iterating Neighbors of $u$ | Fit for Workflow Schedulers |
| :--- | :--- | :--- | :--- | :--- |
| **Adjacency Matrix** ($V \times V$) | $O(V^2)$ | $O(1)$ | $O(V)$ | **Poor**: Workflows are sparse graphs ($E \ll V^2$). Allocating $1000 \times 1000$ cells wastes memory. |
| **Adjacency List** | $O(V + E)$ | $O(\text{deg}(u))$ | $O(\text{deg}(u))$ | **Optimal**: Linear memory, sub-millisecond neighbor lookups when notifying dependents. |

---

## 3. C++ STL vs. JavaScript Implementation Side-by-Side

### In C++:
```cpp
#include <vector>
#include <string>
#include <unordered_map>

struct Task {
    std::string taskId;
    std::vector<std::string> dependencies;
};

struct GraphRepresentation {
    std::unordered_map<std::string, std::vector<std::string>> adj;
    std::unordered_map<std::string, int> inDegree;
};

GraphRepresentation buildGraph(const std::vector<Task>& tasks) {
    GraphRepresentation graph;

    // 1. Initialize all vertices
    for (const auto& task : tasks) {
        graph.adj[task.taskId] = {};
        graph.inDegree[task.taskId] = 0;
    }

    // 2. Add edges: prereq -> dependent
    for (const auto& task : tasks) {
        const std::string& dependent = task.taskId;
        for (const std::string& prereq : task.dependencies) {
            graph.adj[prereq].push_back(dependent);
            graph.inDegree[dependent]++;
        }
    }
    return graph;
}
```

### In JavaScript (FlowForge Engine):
```javascript
function buildGraphRepresentation(tasks) {
  const adj = new Map();
  const inDegree = new Map();
  const taskIds = [];

  // 1. Initialize all vertices
  for (const task of tasks) {
    taskIds.push(task.taskId);
    adj.set(task.taskId, []);
    inDegree.set(task.taskId, 0);
  }

  // 2. Add edges: prereq -> dependent
  for (const task of tasks) {
    const dependentId = task.taskId;
    for (const prereqId of (task.dependencies || [])) {
      if (adj.has(prereqId)) {
        adj.get(prereqId).push(dependentId);
        inDegree.set(dependentId, (inDegree.get(dependentId) || 0) + 1);
      }
    }
  }

  return { adj, inDegree, taskIds };
}
```

---

## 4. Complexity Analysis
- **Time Complexity**: $\mathcal{O}(V + E)$
  - Initializing vertices takes $\mathcal{O}(V)$.
  - Traversing all dependencies visits every edge exactly once: $\mathcal{O}(E)$.
  - Total time: $\mathcal{O}(V + E)$.
- **Space Complexity**: $\mathcal{O}(V + E)$
  - Maps store $V$ keys. The adjacency arrays store $E$ total elements across all buckets.

