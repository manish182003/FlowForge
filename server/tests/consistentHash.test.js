const { ConsistentHashRing, defaultHash } = require('../src/algorithms/consistentHash');

describe('Module 9: Consistent Hashing DSA Suite', () => {
  describe('defaultHash', () => {
    it('produces a deterministic 32-bit unsigned integer', () => {
      const h1 = defaultHash('task-alpha');
      const h2 = defaultHash('task-alpha');
      const h3 = defaultHash('task-beta');

      expect(h1).toBe(h2);
      expect(typeof h1).toBe('number');
      expect(h1).toBeGreaterThanOrEqual(0);
      expect(h1).toBeLessThanOrEqual(0xffffffff);
      expect(h1).not.toBe(h3);
    });
  });

  describe('ConsistentHashRing Basic Operations', () => {
    let ring;

    beforeEach(() => {
      ring = new ConsistentHashRing({ vnodes: 50 });
    });

    it('handles empty ring gracefully', () => {
      expect(ring.getNode('task-1')).toBeNull();
      expect(ring.routeWithMetadata('task-1')).toBeNull();
      expect(ring.getWorkers()).toEqual([]);
      expect(ring.getDistribution()).toEqual([]);
    });

    it('routes all keys to the single worker when N = 1', () => {
      ring.addWorker('worker-lone');
      expect(ring.getWorkers()).toEqual(['worker-lone']);
      expect(ring.hasWorker('worker-lone')).toBe(true);

      const keys = ['task-a', 'task-b', 'task-c', 'task-xyz', 'uuid-999'];
      for (const key of keys) {
        expect(ring.getNode(key)).toBe('worker-lone');
      }
    });

    it('rejects invalid worker parameters', () => {
      expect(() => ring.addWorker('')).toThrow('workerId must be a non-empty string');
      expect(() => ring.addWorker(null)).toThrow('workerId must be a non-empty string');
      expect(() => ring.addWorker('w1', 0)).toThrow('weight must be at least 1');
      expect(() => new ConsistentHashRing({ vnodes: 0 })).toThrow('vnodes must be at least 1');
    });

    it('removes worker cleanly and updates ring keys', () => {
      ring.addWorker('w1');
      ring.addWorker('w2');
      expect(ring.getWorkers().length).toBe(2);

      const removed = ring.removeWorker('w1');
      expect(removed).toBe(true);
      expect(ring.hasWorker('w1')).toBe(false);
      expect(ring.hasWorker('w2')).toBe(true);
      expect(ring.getWorkers()).toEqual(['w2']);

      // Removing a non-existent worker returns false
      expect(ring.removeWorker('non-existent')).toBe(false);
    });

    it('correctly handles duplicate worker registration by re-registering', () => {
      ring.addWorker('w1', 1);
      const vnodes1 = ring.ringKeys.length;
      expect(vnodes1).toBe(50);

      // Re-register with weight 2
      ring.addWorker('w1', 2);
      expect(ring.ringKeys.length).toBe(100);
      expect(ring.getWorkers()).toEqual(['w1']);
    });
  });

  describe('Binary Search & Wraparound Mechanics', () => {
    it('wraps around to the first node when key hash is greater than all ring keys', () => {
      // Mock hash function to verify lower_bound boundary and wraparound
      const customRing = new ConsistentHashRing({
        vnodes: 1,
        hashFn: (key) => {
          if (key === 'node-A#vnode-0') return 1000;
          if (key === 'node-B#vnode-0') return 2000;
          if (key === 'key-between') return 1500;
          if (key === 'key-above-all') return 3000;
          if (key === 'key-below-all') return 500;
          return 0;
        }
      });

      customRing.addWorker('node-A');
      customRing.addWorker('node-B');

      // key-below-all (500) -> first hash >= 500 is 1000 (node-A)
      expect(customRing.getNode('key-below-all')).toBe('node-A');

      // key-between (1500) -> first hash >= 1500 is 2000 (node-B)
      expect(customRing.getNode('key-between')).toBe('node-B');

      // key-above-all (3000) -> exceeds 2000, wraps around to index 0 (1000, node-A)
      expect(customRing.getNode('key-above-all')).toBe('node-A');
    });

    it('returns rich metadata for visualization', () => {
      const ring = new ConsistentHashRing({ vnodes: 20 });
      ring.addWorker('worker-alpha');
      ring.addWorker('worker-beta');

      const meta = ring.routeWithMetadata('job-4029');
      expect(meta).toHaveProperty('key', 'job-4029');
      expect(meta).toHaveProperty('keyHash');
      expect(meta).toHaveProperty('assignedWorker');
      expect(['worker-alpha', 'worker-beta']).toContain(meta.assignedWorker);
      expect(meta).toHaveProperty('ringPositionDegrees');
      expect(meta).toHaveProperty('vnodePositionDegrees');
      expect(meta.totalWorkers).toBe(2);
      expect(meta.totalVnodes).toBe(40);
    });
  });

  describe('Load Distribution and Virtual Nodes (Vnodes)', () => {
    it('achieves balanced keyspace distribution across multiple workers', () => {
      const ring = new ConsistentHashRing({ vnodes: 100 });
      ring.addWorker('w1');
      ring.addWorker('w2');
      ring.addWorker('w3');
      ring.addWorker('w4');

      const dist = ring.getDistribution();
      expect(dist.length).toBe(4);

      // With 4 workers and 100 vnodes each, each should own ~25% of keyspace
      for (const w of dist) {
        expect(w.vnodeCount).toBe(100);
        // Distribution should fall within reasonable bounds [15%, 35%]
        expect(w.keyspaceSharePercent).toBeGreaterThan(15);
        expect(w.keyspaceSharePercent).toBeLessThan(35);
      }
    });

    it('allocates roughly double keyspace share to weighted worker', () => {
      const ring = new ConsistentHashRing({ vnodes: 100 });
      ring.addWorker('worker-standard', 1); // 100 vnodes
      ring.addWorker('worker-beefy', 2);    // 200 vnodes

      const dist = ring.getDistribution();
      const standard = dist.find(d => d.workerId === 'worker-standard');
      const beefy = dist.find(d => d.workerId === 'worker-beefy');

      expect(standard.vnodeCount).toBe(100);
      expect(beefy.vnodeCount).toBe(200);

      // Standard should have ~33%, Beefy should have ~67%
      expect(beefy.keyspaceSharePercent).toBeGreaterThan(standard.keyspaceSharePercent);
      expect(beefy.keyspaceSharePercent).toBeGreaterThan(50);
    });
  });

  describe('Migration Simulation: Consistent Hashing vs Modulo Hashing', () => {
    it('demonstrates that consistent hashing reassigns ~1/N keys vs ~(N-1)/N in modulo hashing', () => {
      const ring = new ConsistentHashRing({ vnodes: 100 });
      ring.addWorker('worker-1');
      ring.addWorker('worker-2');
      ring.addWorker('worker-3');
      ring.addWorker('worker-4'); // Initial N = 4

      // Generate 1,000 synthetic task keys
      const sampleKeys = [];
      for (let i = 0; i < 1000; i++) {
        sampleKeys.push(`task-key-${i}-${Math.random()}`);
      }

      // Add a 5th worker (Final N = 5)
      // Theoretical expected reassignment for Consistent Hashing: 1 / 5 = 20%
      // Modulo hashing: hash % 4 vs hash % 5 -> typically 70-80% moved!
      const sim = ring.simulateMigration(sampleKeys, 'worker-5', 'add');

      expect(sim.totalKeys).toBe(1000);
      expect(sim.initialWorkerCount).toBe(4);
      expect(sim.finalWorkerCount).toBe(5);

      // Consistent Hashing reassignment should be roughly ~20% (allow tolerance [10%, 30%])
      expect(sim.consistentHashing.reassignedPercent).toBeGreaterThan(10);
      expect(sim.consistentHashing.reassignedPercent).toBeLessThan(30);

      // Modulo Hashing should disrupt > 60% of all keys
      expect(sim.moduloHashing.reassignedPercent).toBeGreaterThan(60);

      // CRITICAL PROPERTY: Consistent Hashing moves FAR fewer keys than Modulo Hashing
      expect(sim.consistentHashing.reassignedPercent).toBeLessThan(sim.moduloHashing.reassignedPercent);
    });

    it('demonstrates minimal disruption when removing a worker', () => {
      const ring = new ConsistentHashRing({ vnodes: 100 });
      ring.addWorker('worker-A');
      ring.addWorker('worker-B');
      ring.addWorker('worker-C'); // N = 3

      const sampleKeys = Array.from({ length: 500 }, (_, i) => `job-${i}`);

      // Record which worker owns each key before removal
      const beforeRemoval = new Map();
      for (const k of sampleKeys) {
        beforeRemoval.set(k, ring.getNode(k));
      }

      // Remove worker-C
      ring.removeWorker('worker-C');

      // CRITICAL PROPERTY: If a key was assigned to worker-A or worker-B,
      // it MUST STILL BE assigned to worker-A or worker-B respectively!
      // They should NOT move between surviving workers!
      let nonDisruptedKeys = 0;
      let migratedFromC = 0;

      for (const k of sampleKeys) {
        const oldWorker = beforeRemoval.get(k);
        const newWorker = ring.getNode(k);

        if (oldWorker === 'worker-C') {
          // Keys that belonged to worker-C are now reassigned to A or B
          expect(['worker-A', 'worker-B']).toContain(newWorker);
          migratedFromC++;
        } else {
          // Keys that belonged to A or B must NEVER change!
          expect(newWorker).toBe(oldWorker);
          nonDisruptedKeys++;
        }
      }

      expect(nonDisruptedKeys + migratedFromC).toBe(500);
      expect(migratedFromC).toBeGreaterThan(0);
    });
  });
});
