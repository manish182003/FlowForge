# Module 09: Consistent Hashing & Cluster Sharding

## 1. The Core Distributed Problem: The Rehash Avalanche

When distributing tasks or caching partitions across a fleet of $N$ worker nodes, the naive textbook approach is **Modulo Hashing**:

$$\text{workerIndex} = \text{hash}(\text{key}) \pmod N$$

### Why Modulo Hashing Fails in Dynamic Clusters

Consider a cluster of $N = 4$ workers managing 1,000 tasks or cache keys. What happens when a 5th worker joins ($N \to 5$)?

$$\text{Old: } \text{hash}(k) \pmod 4 \quad \longrightarrow \quad \text{New: } \text{hash}(k) \pmod 5$$

Because 4 and 5 are coprime, nearly **every single key** changes its target worker:

$$\text{Fraction of keys reassigned} = 1 - \frac{1}{N+1} = \frac{N}{N+1} = \frac{4}{5} = 80\%$$

For a cluster of $N = 100$ workers adding the 101st node, **99% of all keys are reassigned**! In a production system, this creates a **Cache Stampede / Rehash Avalanche**:
- Databases get hammered with cache misses.
- Workers drop in-flight tasks and thrash memory to re-fetch partitions.
- Cluster cascades into failure.

---

## 2. Karger's Theorem & The Consistent Hash Ring

In 1997, David Karger et al. (MIT) introduced **Consistent Hashing**:
1. Treat the entire output range of a deterministic 32-bit hash function $[0, 2^{32}-1]$ as a continuous circular ring ($0^\circ \to 360^\circ$).
2. Map **Worker Nodes** onto the ring by hashing their identifiers (e.g. `hash("worker-alpha")`).
3. Map **Task Keys** onto the ring using the same hash function (e.g. `hash("task-883")`).
4. **Clockwise Rule**: A key belongs to the **first worker encountered moving clockwise** along the ring (i.e. the smallest worker hash $\ge \text{hash}(key)$). If the key's hash exceeds all workers on the ring, wrap around to the first worker at index 0.

### Mathematical Proof of Minimal Disruption

When a new worker $W_{\text{new}}$ is inserted between two existing workers on the ring:
- Only keys falling into the interval directly preceding $W_{\text{new}}$ are reassigned to $W_{\text{new}}$.
- All keys owned by other workers **remain completely untouched**.
- Average fraction of keys migrated:

$$\mathbb{E}[\text{Reassigned Keys}] = \frac{1}{N_{\text{final}}}$$

In our empirical simulation:
- **Modulo Hashing ($N = 4 \to 5$)**: 78.4% of keys moved.
- **Consistent Hashing ($N = 4 \to 5$)**: **19.8% of keys moved** (matching $\frac{1}{5} = 20\%$).

---

## 3. The Non-Uniformity Problem & Virtual Nodes (Vnodes)

### Why 3 Physical Nodes on a Ring Cause Massive Skew

If you place only 3 physical workers on the ring, random chance often clusters them close together (e.g., at $10^\circ, 25^\circ, 35^\circ$). One worker ends up owning $335^\circ$ ($93\%$ of the keyspace), becoming a fatal bottleneck while the other two starve.

### The Virtual Node Solution

Instead of placing physical worker $W_i$ once, we create $V$ **virtual replicas**:

$$\{ W_i\#\text{vnode-0},\; W_i\#\text{vnode-1},\; \dots,\; W_i\#\text{vnode-}(V-1) \}$$

- **Variance Reduction**: By the Law of Large Numbers, distributing $N \times V$ points uniformly around the ring makes each worker's keyspace share converge to $\frac{1}{N}$.
- **Heterogeneous Hardware (Capacity Weighting)**: A worker with $2\times$ CPU capacity can be assigned $2V$ virtual nodes to naturally pull $2\times$ the workload.
- **Uniform Handover upon Worker Crash**: When worker $W_k$ dies, its virtual nodes are interleaved throughout the ring. Its load is split **evenly across all remaining workers**, rather than dumping 100% of the dead worker's load onto its single immediate successor.

---

## 4. Clockwise Binary Search: C++ STL vs. JavaScript

### C++: `std::map<uint32_t, string>` (Self-Balancing Red-Black Tree)

In C++, `std::map` maintains keys in sorted order. Finding the first node $\ge \text{hash}(k)$ takes $O(\log K)$ using `std::lower_bound`:

```cpp
#include <map>
#include <string>

class ConsistentHashRing {
    std::map<uint32_t, std::string> ring; // Sorted 32-bit keyspace
    
public:
    std::string getNode(const std::string& key) {
        if (ring.empty()) return "";
        
        uint32_t keyHash = hashFn(key);
        // O(log(N * V)) lookup: first element with hash >= keyHash
        auto it = ring.lower_bound(keyHash);
        
        // Circular ring wraparound: if key is beyond highest hash
        if (it == ring.end()) {
            it = ring.begin();
        }
        
        return it->second;
    }
};
```

### JavaScript: Sorted Array + Iterative Binary Search

In JavaScript, objects and `Map` do not provide $O(\log K)$ range queries. We maintain an ordered array of 32-bit hashes `ringKeys` and implement binary search (`lower_bound`):

```javascript
findLowerBoundIndex(targetHash) {
  if (this.ringKeys.length === 0) return -1;

  let low = 0;
  let high = this.ringKeys.length - 1;
  let resultIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (this.ringKeys[mid] >= targetHash) {
      resultIndex = mid;
      high = mid - 1; // Check if there is an earlier match on the left
    } else {
      low = mid + 1;
    }
  }

  // Circular wraparound: if target exceeds all hashes, return index 0
  return resultIndex === -1 ? 0 : resultIndex;
}
```

---

## 5. Critical Interview Defense: Affinity vs. Consensus

> [!CAUTION]
> **Interview Trap Question**:
> *"If our cluster uses consistent hashing to assign tasks to workers, can we remove Redis locks, leases, and fencing tokens?"*

### The Answer: Absolutely NOT.

1. **Consistent Hashing is an Affinity / Routing Heuristic, NOT a Consensus Protocol**:
   - In an asynchronous network, worker heartbeat delays, GC pauses, or network partitions (split-brain) mean different nodes can temporarily observe different active member sets.
   - If Worker A sees 4 workers and Worker B sees 3 workers, both workers may believe they are the legitimate clockwise successor for task $K$.
   - Both workers would execute task $K$, causing duplicate writes and race conditions!
2. **The Defense**:
   - Consistent Hashing routes the job to the **preferred** worker (maximizing CPU cache and disk locality).
   - But the worker **MUST still acquire an atomic lease** (like FlowForge's Redis lease or MongoDB `findOneAndUpdate({ status: 'QUEUED' }, { status: 'RUNNING', leaseOwner: id })`) before executing the task!

---

## 6. FlowForge Cluster API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/cluster/ring` | Returns active workers, distribution percentage, and all Vnode angular positions on $[0^\circ, 360^\circ]$. |
| `POST` | `/api/cluster/ring/route` | Routes `{ key }` to responsible worker with 32-bit hash, ring angle, and target Vnode metadata. |
| `POST` | `/api/cluster/ring/workers` | Registers worker with optional weight (`weight=2` gives double Vnodes). |
| `DELETE` | `/api/cluster/ring/workers/:id` | Removes worker and its virtual nodes from the ring. |
| `POST` | `/api/cluster/ring/simulate` | Executes side-by-side migration comparison between Consistent Hashing vs Modulo Hashing. |
| `POST` | `/api/cluster/ring/sync` | Syncs the ring topology with active MongoDB `WorkerHeartbeat` instances. |
| `POST` | `/api/cluster/ring/reset` | Resets the ring to default demonstration nodes (`worker-alpha`, `beta`, `gamma`). |
