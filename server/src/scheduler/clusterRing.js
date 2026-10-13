const { ConsistentHashRing } = require('../algorithms/consistentHash');
const WorkerHeartbeat = require('../models/WorkerHeartbeat');

/**
 * ClusterRingService
 * 
 * Manages the cluster-wide Consistent Hash Ring instance.
 * Connects physical distributed worker nodes to virtual nodes on the ring,
 * supports dynamic worker registration / heartbeats, task routing with worker affinity,
 * and migration simulation for system design education.
 */
class ClusterRingService {
  constructor({ vnodes = 30 } = {}) {
    this.vnodes = vnodes;
    this.ring = new ConsistentHashRing({ vnodes });
    
    // Seed default demonstration cluster workers
    this.ring.addWorker('worker-alpha', 1);
    this.ring.addWorker('worker-beta', 1);
    this.ring.addWorker('worker-gamma', 1);
  }

  /**
   * Synchronizes the ring with healthy workers from MongoDB WorkerHeartbeat table.
   * If database workers exist, reconciles the ring.
   */
  async syncWithDatabaseWorkers() {
    try {
      const tenSecondsAgo = new Date(Date.now() - 10000);
      const healthyWorkers = await WorkerHeartbeat.find({
        lastHeartbeat: { $gte: tenSecondsAgo },
        status: { $in: ['healthy', 'busy'] }
      });

      if (healthyWorkers && healthyWorkers.length > 0) {
        // Clear demonstration workers if real workers are active
        this.ring.clear();
        for (const w of healthyWorkers) {
          // Weight can scale with worker concurrency
          const weight = Math.max(1, Math.floor((w.concurrency || 2) / 2));
          this.ring.addWorker(w.workerId, weight);
        }
      }
    } catch (err) {
      // In-memory or standalone fallback if DB is unreachable
    }
  }

  /**
   * Returns current ring state with detailed virtual node positions
   * formatted for 360-degree SVG/Canvas visualization.
   */
  getState() {
    const workers = this.ring.getWorkers();
    const distribution = this.ring.getDistribution();
    
    // Generate virtual node points around the circle [0 to 360 degrees]
    const MAX_HASH = 0xffffffff;
    const vnodePoints = this.ring.ringKeys.map((hash) => {
      const workerId = this.ring.ring.get(hash);
      const degree = (hash / MAX_HASH) * 360;
      return {
        hash,
        workerId,
        degree: Number(degree.toFixed(2))
      };
    });

    return {
      vnodesPerWorker: this.ring.vnodes,
      totalWorkers: workers.length,
      totalVnodes: this.ring.ringKeys.length,
      workers,
      distribution,
      vnodePoints
    };
  }

  addWorker(workerId, weight = 1) {
    this.ring.addWorker(workerId, weight);
    return this.getState();
  }

  removeWorker(workerId) {
    const removed = this.ring.removeWorker(workerId);
    return {
      removed,
      state: this.getState()
    };
  }

  routeKey(key) {
    return this.ring.routeWithMetadata(key);
  }

  simulateMigration(sampleSize = 500, targetWorkerId, action = 'add') {
    const keys = [];
    for (let i = 0; i < sampleSize; i++) {
      keys.push(`task-sim-${i}-${(i * 7919) % 10000}`);
    }
    return this.ring.simulateMigration(keys, targetWorkerId, action);
  }

  resetDefaultCluster() {
    this.ring.clear();
    this.ring.addWorker('worker-alpha', 1);
    this.ring.addWorker('worker-beta', 1);
    this.ring.addWorker('worker-gamma', 1);
    return this.getState();
  }
}

// Singleton cluster ring service instance
const clusterRing = new ClusterRingService();

module.exports = {
  ClusterRingService,
  clusterRing
};
