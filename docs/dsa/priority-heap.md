# DSA Guide: Binary Heap (Priority Queue) with Priority Aging

## 1. Why a Scheduler Needs a Binary Heap
When 20 tasks become eligible to run at the same time, which task gets assigned to the first available worker?
- If we use a simple array and search for the highest-priority task on every pop, finding the next task takes $\mathcal{O}(N)$ time.
- If we use a **Binary Heap (Priority Queue)**:
  - Inserting an eligible task: $\mathcal{O}(\log N)$
  - Extracting the highest-priority task: $\mathcal{O}(\log N)$
  - Inspecting the top task: $\mathcal{O}(1)$

---

## 2. Array-Based Complete Binary Tree Representation
In an array-backed binary heap:
- The root is at index `0`.
- For any node at index `i`:
  - **Parent index**: `Math.floor((i - 1) / 2)`
  - **Left child index**: `2 * i + 1`
  - **Right child index**: `2 * i + 2`

```
         [0] Priority: 10
        /              \
    [1] P: 8        [2] P: 7
    /      \
 [3] P: 4  [4] P: 5
```

---

## 3. Starvation Prevention & Priority Aging
In production systems, if high-priority tasks keep arriving, a low-priority task might sit in the queue forever. This is called **thread/task starvation**.

To prevent starvation, FlowForge implements **Priority Aging**:
$$\text{Effective Priority} = \text{Base Priority} + \left\lfloor \frac{\text{Wait Time}}{\text{Aging Interval}} \right\rfloor$$
Every 5 seconds a task waits in queue, its effective priority increases by +1 until it is eventually guaranteed to be dispatched.

---

## 4. C++ STL vs. JavaScript Implementation

### In C++:
C++ STL provides `std::priority_queue`, which uses `std::push_heap` and `std::pop_heap` internally:
```cpp
#include <queue>
#include <vector>
#include <string>

struct TaskItem {
    std::string taskId;
    int priority;
    long long enqueuedAt;
};

struct CompareTask {
    bool operator()(const TaskItem& a, const TaskItem& b) {
        if (a.priority != b.priority) {
            return a.priority < b.priority; // Max-heap: highest priority at top
        }
        return a.enqueuedAt > b.enqueuedAt; // Earlier arrival wins
    }
};

std::priority_queue<TaskItem, std::vector<TaskItem>, CompareTask> pq;
```

### In JavaScript (FlowForge Engine):
```javascript
class PriorityQueue {
  constructor({ agingIntervalMs = 5000 } = {}) {
    this.heap = [];
    this.agingIntervalMs = agingIntervalMs;
  }

  getEffectivePriority(item, now = Date.now()) {
    const base = item.priority ?? 5;
    const waitMs = Math.max(0, now - (item.enqueuedAt || now));
    return base + Math.floor(waitMs / this.agingIntervalMs);
  }

  push(item) {
    this.heap.push(item);
    this._siftUp(this.heap.length - 1); // O(log N)
  }

  pop() {
    if (this.heap.length <= 1) return this.heap.pop() || null;
    const max = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._siftDown(0); // O(log N)
    return max;
  }
}
```

