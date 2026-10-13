/**
 * Array-Backed Binary Max-Heap (Priority Queue) with Priority Aging & Deterministic Tie-Breaking
 * 
 * In a Binary Heap stored in an array:
 * For element at index i:
 * - Parent: Math.floor((i - 1) / 2)
 * - Left Child: 2 * i + 1
 * - Right Child: 2 * i + 2
 * 
 * Time Complexities:
 * - push(item): O(log N)
 * - pop():      O(log N)
 * - peek():     O(1)
 * - size():     O(1)
 */
class PriorityQueue {
  /**
   * @param {Object} options
   * @param {number} [options.agingIntervalMs=5000] - Time interval in ms after which a waiting task gains +1 effective priority (Starvation Prevention)
   */
  constructor({ agingIntervalMs = 5000 } = {}) {
    this.heap = [];
    this.agingIntervalMs = agingIntervalMs;
  }

  /**
   * Computes effective priority including starvation aging bonus.
   * If a low-priority task sits in queue for a long time, its effective priority
   * gradually increases so high-priority tasks do not starve it indefinitely.
   * 
   * @param {Object} item
   * @param {number} [currentTime=Date.now()]
   * @returns {number}
   */
  getEffectivePriority(item, currentTime = Date.now()) {
    const basePriority = item.priority ?? 5;
    const enqueuedAt = item.enqueuedAt || currentTime;
    const waitTimeMs = Math.max(0, currentTime - enqueuedAt);
    const agingBonus = Math.floor(waitTimeMs / this.agingIntervalMs);
    return basePriority + agingBonus;
  }

  /**
   * Deterministic Comparator:
   * Returns positive number if A has higher priority than B (A should be above B).
   * Returns negative number if B has higher priority than A.
   * 
   * Rules:
   * 1. Higher effective priority wins.
   * 2. Tie-break 1: Earlier enqueuedAt timestamp wins (FIFO among equal priorities).
   * 3. Tie-break 2: Lexicographical order of taskId (deterministic tie-breaker).
   */
  compare(a, b, currentTime = Date.now()) {
    const effA = this.getEffectivePriority(a, currentTime);
    const effB = this.getEffectivePriority(b, currentTime);

    if (effA !== effB) {
      return effA - effB; // Higher number has higher priority
    }

    // Tie-break 1: Older items scheduled first
    const timeA = a.enqueuedAt || 0;
    const timeB = b.enqueuedAt || 0;
    if (timeA !== timeB) {
      return timeB - timeA; // Earlier timestamp wins (larger difference)
    }

    // Tie-break 2: Deterministic alphabetical tie-breaker
    const idA = a.taskId || '';
    const idB = b.taskId || '';
    if (idA < idB) return 1;
    if (idA > idB) return -1;
    return 0;
  }

  size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  /**
   * Returns highest-priority item without removing it. O(1)
   */
  peek() {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  /**
   * Inserts an item into the heap. O(log N)
   * 1. Append element to end of array.
   * 2. Sift up (bubble up) until heap invariant is restored.
   */
  push(item) {
    const node = {
      ...item,
      enqueuedAt: item.enqueuedAt || Date.now()
    };
    this.heap.push(node);
    this._siftUp(this.heap.length - 1);
  }

  /**
   * Extracts and returns highest-priority item. O(log N)
   * 1. Swap root with the last leaf.
   * 2. Pop and store the maximum item.
   * 3. Sift down the new root until heap invariant is restored.
   */
  pop() {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop();

    const max = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._siftDown(0);
    return max;
  }

  /**
   * Sift Up (Bubble Up) - O(log N)
   * Compares child with its parent; swaps if child has higher priority.
   */
  _siftUp(index) {
    const now = Date.now();
    let current = index;

    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      // If current node > parent, swap them
      if (this.compare(this.heap[current], this.heap[parent], now) > 0) {
        this._swap(current, parent);
        current = parent;
      } else {
        break;
      }
    }
  }

  /**
   * Sift Down (Bubble Down) - O(log N)
   * Compares parent with left and right children; swaps with the larger child.
   */
  _siftDown(index) {
    const now = Date.now();
    let current = index;
    const length = this.heap.length;

    while (true) {
      let largest = current;
      const left = 2 * current + 1;
      const right = 2 * current + 2;

      if (left < length && this.compare(this.heap[left], this.heap[largest], now) > 0) {
        largest = left;
      }
      if (right < length && this.compare(this.heap[right], this.heap[largest], now) > 0) {
        largest = right;
      }

      if (largest !== current) {
        this._swap(current, largest);
        current = largest;
      } else {
        break;
      }
    }
  }

  _swap(i, j) {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}

module.exports = { PriorityQueue };

