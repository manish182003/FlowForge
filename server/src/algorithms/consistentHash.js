const crypto = require('crypto');

/**
 * Consistent Hash Ring with Virtual Nodes and Binary Search
 * 
 * In distributed computing, partitioning data or routing tasks across dynamic worker
 * nodes using traditional modulo hashing (hash(key) % N) suffers from the "Rehash Avalanche":
 * when 1 node is added or removed, (N - 1) / N of all keys (~99% for 100 nodes) are
 * remapped to completely different nodes.
 * 
 * Consistent Hashing (Karger et al., 1997) maps both WORKERS and KEYS onto a circular
 * keyspace [0, 2^32 - 1].
 * - A key is assigned to the first worker encountered moving clockwise along the ring.
 * - When a worker arrives or departs, ONLY keys in its immediate interval are reassigned (~1 / N).
 * 
 * Virtual Nodes (Vnodes):
 * To prevent severe hotspot clustering caused by random worker placement on the ring,
 * each physical worker is replicated V times (e.g., worker-1#0, worker-1#1, ...).
 * This ensures balanced load distribution across the cluster (law of large numbers).
 * 
 * Time Complexities:
 * - addWorker(workerId, weight): O(V * log(TotalVnodes))
 * - removeWorker(workerId):     O(TotalVnodes)
 * - getNode(key):               O(log(TotalVnodes)) via Binary Search (lower_bound)
 * 
 * Space Complexity: O(N * V) where N = physical workers, V = virtual nodes per worker.
 */

/**
 * Hashes an arbitrary string key to a 32-bit unsigned integer [0, 2^32 - 1].
 * Uses MD5 truncated to 4 bytes for uniform, deterministic distribution.
 * 
 * @param {string} key 
 * @returns {number} 32-bit unsigned integer (0 to 4294967295)
 */
function defaultHash(key) {
  const hash = crypto.createHash('md5').update(String(key)).digest();
  // Read first 4 bytes as 32-bit big-endian unsigned integer
  return hash.readUInt32BE(0);
}

class ConsistentHashRing {
  /**
   * @param {Object} [options]
   * @param {number} [options.vnodes=50] - Number of virtual nodes per physical worker
   * @param {Function} [options.hashFn=defaultHash] - 32-bit hash function
   */
  constructor({ vnodes = 50, hashFn = defaultHash } = {}) {
    if (vnodes < 1) {
      throw new Error('vnodes must be at least 1');
    }
    this.vnodes = vnodes;
    this.hashFn = hashFn;

    // Map: 32-bit hash value -> physical workerId
    this.ring = new Map();

    // Sorted array of 32-bit hash values for O(log K) binary search lookup
    this.ringKeys = [];

    // Set of active physical worker IDs
    this.workers = new Set();

    // Map: workerId -> array of assigned hashes (for O(V) fast removal)
    this.workerHashes = new Map();
  }

  /**
   * Adds a physical worker to the hash ring with optional weight.
   * A worker with weight 2 receives 2 * vnodes virtual nodes.
   * 
   * @param {string} workerId - Unique worker identifier
   * @param {number} [weight=1] - Proportional capacity weight (must be >= 1)
   */
  addWorker(workerId, weight = 1) {
    if (!workerId || typeof workerId !== 'string') {
      throw new Error('workerId must be a non-empty string');
    }
    if (weight < 1) {
      throw new Error('weight must be at least 1');
    }

    // If worker already exists, remove it first to rebalance with new weight
    if (this.workers.has(workerId)) {
      this.removeWorker(workerId);
    }

    this.workers.add(workerId);
    const numVnodes = Math.floor(this.vnodes * weight);
    const hashesForWorker = [];

    for (let i = 0; i < numVnodes; i++) {
      // Deterministic virtual node token string: e.g. "worker-1#vnode-0"
      const vnodeToken = `${workerId}#vnode-${i}`;
      const hash = this.hashFn(vnodeToken);

      // Handle rare 32-bit collision: step forward linearly if taken
      let resolvedHash = hash;
      while (this.ring.has(resolvedHash)) {
        resolvedHash = (resolvedHash + 1) >>> 0; // Unsigned 32-bit rollover
      }

      this.ring.set(resolvedHash, workerId);
      hashesForWorker.push(resolvedHash);
    }

    this.workerHashes.set(workerId, hashesForWorker);

    // Rebuild and sort the ringKeys index
    this._rebuildRingKeys();
  }

  /**
   * Removes a physical worker and all its virtual nodes from the ring.
   * 
   * @param {string} workerId 
   * @returns {boolean} True if worker was present and removed
   */
  removeWorker(workerId) {
    if (!this.workers.has(workerId)) {
      return false;
    }

    const hashes = this.workerHashes.get(workerId) || [];
    for (const hash of hashes) {
      this.ring.delete(hash);
    }

    this.workerHashes.delete(workerId);
    this.workers.delete(workerId);

    this._rebuildRingKeys();
    return true;
  }

  /**
   * Rebuilds and sorts the ringKeys array for binary search.
   * @private
   */
  _rebuildRingKeys() {
    this.ringKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  /**
   * Binary Search lower_bound:
   * Finds the index of the first hash in ringKeys that is >= targetHash.
   * Equivalent to C++ std::lower_bound(ringKeys.begin(), ringKeys.end(), targetHash).
   * 
   * If targetHash exceeds all keys, returns 0 (circular ring wraparound).
   * 
   * @param {number} targetHash 
   * @returns {number} Index in ringKeys
   */
  findLowerBoundIndex(targetHash) {
    if (this.ringKeys.length === 0) return -1;

    let low = 0;
    let high = this.ringKeys.length - 1;
    let resultIndex = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.ringKeys[mid] >= targetHash) {
        resultIndex = mid;
        high = mid - 1; // Look for an earlier match on the left
      } else {
        low = mid + 1;
      }
    }

    // Wraparound: if target is greater than all hashes on the ring,
    // the clockwise search wraps around to the first element (index 0)
    return resultIndex === -1 ? 0 : resultIndex;
  }

  /**
   * Routes a key (task ID, workflow ID, partition key) to its responsible worker.
   * 
   * @param {string} key 
   * @returns {string|null} Responsible workerId, or null if ring is empty
   */
  getNode(key) {
    if (this.ringKeys.length === 0) {
      return null;
    }

    const hash = this.hashFn(String(key));
    const idx = this.findLowerBoundIndex(hash);
    const ringHash = this.ringKeys[idx];

    return this.ring.get(ringHash) || null;
  }

  /**
   * Returns detailed routing metadata for a key (used for visualization & debugging).
   * 
   * @param {string} key 
   * @returns {Object|null}
   */
  routeWithMetadata(key) {
    if (this.ringKeys.length === 0) return null;

    const hash = this.hashFn(String(key));
    const idx = this.findLowerBoundIndex(hash);
    const ringHash = this.ringKeys[idx];
    const workerId = this.ring.get(ringHash);

    return {
      key,
      keyHash: hash,
      assignedWorker: workerId,
      assignedVnodeHash: ringHash,
      ringPositionDegrees: ((hash / 0xffffffff) * 360).toFixed(2),
      vnodePositionDegrees: ((ringHash / 0xffffffff) * 360).toFixed(2),
      totalVnodes: this.ringKeys.length,
      totalWorkers: this.workers.size
    };
  }

  /**
   * Returns list of currently registered physical worker IDs.
   * @returns {string[]}
   */
  getWorkers() {
    return Array.from(this.workers);
  }

  /**
   * Checks if a physical worker is currently registered.
   * @param {string} workerId 
   * @returns {boolean}
   */
  hasWorker(workerId) {
    return this.workers.has(workerId);
  }

  /**
   * Computes the theoretical percentage of the 32-bit keyspace owned by each worker.
   * Useful for auditing cluster load uniformity and detecting imbalances.
   * 
   * @returns {Array<{ workerId: string, vnodeCount: number, keyspaceSharePercent: number }>}
   */
  getDistribution() {
    if (this.ringKeys.length === 0) return [];

    const MAX_HASH = 0xffffffff;
    const sharePerWorker = new Map();
    for (const w of this.workers) {
      sharePerWorker.set(w, 0);
    }

    for (let i = 0; i < this.ringKeys.length; i++) {
      const currentHash = this.ringKeys[i];
      const prevHash = i === 0 ? this.ringKeys[this.ringKeys.length - 1] : this.ringKeys[i - 1];

      let segmentSpan;
      if (i === 0) {
        // Wraparound segment: from prevHash to MAX_HASH, plus 0 to currentHash
        segmentSpan = (MAX_HASH - prevHash) + currentHash;
      } else {
        segmentSpan = currentHash - prevHash;
      }

      const worker = this.ring.get(currentHash);
      sharePerWorker.set(worker, (sharePerWorker.get(worker) || 0) + segmentSpan);
    }

    return Array.from(this.workers).map((workerId) => {
      const span = sharePerWorker.get(workerId) || 0;
      const percent = (span / MAX_HASH) * 100;
      const vnodeCount = this.workerHashes.get(workerId)?.length || 0;
      return {
        workerId,
        vnodeCount,
        keyspaceSharePercent: Number(percent.toFixed(2))
      };
    });
  }

  /**
   * Simulates keyspace migration when adding or removing a worker.
   * Compares Consistent Hashing migration vs Modulo Hashing migration.
   * 
   * @param {string[]} sampleKeys - List of sample keys (e.g. 1000 tasks)
   * @param {string} targetWorkerId - Worker to add or remove
   * @param {'add'|'remove'} action 
   * @returns {Object}
   */
  simulateMigration(sampleKeys, targetWorkerId, action = 'add') {
    if (!sampleKeys || sampleKeys.length === 0) {
      throw new Error('sampleKeys must be a non-empty array');
    }

    const initialWorkers = this.getWorkers();
    if (initialWorkers.length === 0) {
      throw new Error('Ring must have initial workers to simulate migration');
    }

    // 1. Record original consistent hashing assignments
    const originalAssignments = new Map();
    for (const key of sampleKeys) {
      originalAssignments.set(key, this.getNode(key));
    }

    // 2. Perform modification
    if (action === 'add') {
      this.addWorker(targetWorkerId);
    } else {
      this.removeWorker(targetWorkerId);
    }

    // 3. Record new assignments
    let consistentMovedCount = 0;
    const reassignedKeys = [];

    for (const key of sampleKeys) {
      const newWorker = this.getNode(key);
      const oldWorker = originalAssignments.get(key);
      if (newWorker !== oldWorker) {
        consistentMovedCount++;
        reassignedKeys.push({ key, oldWorker, newWorker });
      }
    }

    // 4. Calculate traditional Modulo Hashing for comparison
    // hash(key) % N vs hash(key) % (N +/- 1)
    const initialN = initialWorkers.length;
    const finalN = action === 'add' ? initialN + 1 : Math.max(1, initialN - 1);
    let moduloMovedCount = 0;

    for (const key of sampleKeys) {
      const hash = this.hashFn(key);
      const oldModuloNode = hash % initialN;
      const newModuloNode = hash % finalN;
      if (oldModuloNode !== newModuloNode) {
        moduloMovedCount++;
      }
    }

    // Restore original state
    if (action === 'add') {
      this.removeWorker(targetWorkerId);
    } else {
      this.addWorker(targetWorkerId);
    }

    const totalKeys = sampleKeys.length;
    return {
      totalKeys,
      action,
      targetWorkerId,
      initialWorkerCount: initialN,
      finalWorkerCount: finalN,
      consistentHashing: {
        reassignedCount: consistentMovedCount,
        reassignedPercent: Number(((consistentMovedCount / totalKeys) * 100).toFixed(2)),
        theoreticalExpectedPercent: Number(((1 / finalN) * 100).toFixed(2))
      },
      moduloHashing: {
        reassignedCount: moduloMovedCount,
        reassignedPercent: Number(((moduloMovedCount / totalKeys) * 100).toFixed(2))
      },
      reassignedSample: reassignedKeys.slice(0, 10)
    };
  }

  /**
   * Resets the entire ring.
   */
  clear() {
    this.ring.clear();
    this.ringKeys = [];
    this.workers.clear();
    this.workerHashes.clear();
  }
}

module.exports = {
  ConsistentHashRing,
  defaultHash
};

