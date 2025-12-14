/**
 * Region Selector - Automatically selects the best server region based on latency
 * 
 * Usage:
 * 1. Add to client/index.html:
 *    <script src="regionSelector.js"></script>
 *    <script>
 *      window.BACKEND_REGIONS = {
 *        us: 'server-us.example.com',
 *        eu: 'server-eu.example.com',
 *        asia: 'server-asia.example.com'
 *      };
 *    </script>
 * 
 * 2. The best region will be selected automatically and stored in window.BEST_BACKEND_URL
 */

class RegionSelector {
  constructor(regions, options = {}) {
    this.regions = regions;
    this.timeout = options.timeout || 3000; // 3 second timeout per region
    this.cacheKey = 'instant-io-best-region';
    this.cacheDuration = options.cacheDuration || 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Test latency to a WebSocket server
   */
  async testRegion(name, url) {
    return new Promise((resolve) => {
      const start = performance.now();
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${url}`;
      
      const ws = new WebSocket(wsUrl);
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          resolve({ name, url, latency: Infinity, error: 'Timeout' });
        }
      }, this.timeout);

      ws.onopen = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const latency = performance.now() - start;
          ws.close();
          resolve({ name, url, latency, error: null });
        }
      };

      ws.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ name, url, latency: Infinity, error: 'Connection failed' });
        }
      };
    });
  }

  /**
   * Test all regions and return the fastest one
   */
  async selectBestRegion() {
    // Check cache first
    const cached = this.getCachedRegion();
    if (cached && this.regions[cached.name]) {
      console.log(`Using cached region: ${cached.name} (${cached.latency.toFixed(0)}ms)`);
      return cached.url;
    }

    console.log('Testing regions for best latency...');
    const regionEntries = Object.entries(this.regions);
    
    // Test all regions in parallel
    const tests = regionEntries.map(([name, url]) => this.testRegion(name, url));
    const results = await Promise.all(tests);

    // Filter out failed connections and sort by latency
    const validResults = results.filter(r => r.latency !== Infinity);
    
    if (validResults.length === 0) {
      console.warn('All regions failed, using first region as fallback');
      return regionEntries[0][1];
    }

    // Sort by latency (lowest first)
    validResults.sort((a, b) => a.latency - b.latency);
    const best = validResults[0];

    console.log('Region test results:');
    results.forEach(r => {
      const status = r.latency === Infinity ? 'FAILED' : `${r.latency.toFixed(0)}ms`;
      console.log(`  ${r.name}: ${status}`);
    });
    console.log(`Selected: ${best.name} (${best.latency.toFixed(0)}ms)`);

    // Cache the result
    this.cacheRegion(best);

    return best.url;
  }

  /**
   * Get cached region selection
   */
  getCachedRegion() {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (!cached) return null;

      const data = JSON.parse(cached);
      const age = Date.now() - data.timestamp;

      if (age > this.cacheDuration) {
        localStorage.removeItem(this.cacheKey);
        return null;
      }

      return data;
    } catch (e) {
      return null;
    }
  }

  /**
   * Cache region selection
   */
  cacheRegion(result) {
    try {
      const data = {
        name: result.name,
        url: result.url,
        latency: result.latency,
        timestamp: Date.now()
      };
      localStorage.setItem(this.cacheKey, JSON.stringify(data));
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  /**
   * Clear cached region (force re-test)
   */
  clearCache() {
    localStorage.removeItem(this.cacheKey);
  }
}

// Auto-initialize if regions are defined
if (typeof window !== 'undefined' && window.BACKEND_REGIONS) {
  const selector = new RegionSelector(window.BACKEND_REGIONS);
  
  // Select best region asynchronously
  selector.selectBestRegion().then(bestUrl => {
    window.BEST_BACKEND_URL = bestUrl;
    console.log(`Best region selected: ${bestUrl}`);
    
    // Dispatch event so GameClient can use it
    window.dispatchEvent(new CustomEvent('regionSelected', { 
      detail: { url: bestUrl } 
    }));
  }).catch(err => {
    console.error('Region selection failed:', err);
    // Fallback to first region
    const firstRegion = Object.values(window.BACKEND_REGIONS)[0];
    window.BEST_BACKEND_URL = firstRegion;
  });
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RegionSelector;
}

