const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '');

export const api = {
  base: API_BASE,

  /** Backend + Spark status. Resolves with { online, spark } or a clear error. */
  async health() {
    const res = await fetch(`${API_BASE}/api/health`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Backend responded ${res.status}`);
    return res.json();
  },

  /**
   * Aggregated analytics produced by the Spark job.
   * Returns the payload as-is; the payload carries its own `spark` status so the
   * UI can state exactly what is and is not available.
   */
  async analytics() {
    const res = await fetch(`${API_BASE}/api/analytics`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Backend responded ${res.status}`);
    return res.json();
  },

  /** Send simulated readings to the backend so the Spark job can analyse them. */
  async ingest(readings) {
    const res = await fetch(`${API_BASE}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readings }),
    });
    if (!res.ok) throw new Error(`Ingest failed (${res.status})`);
    return res.json();
  },
};

export default api;
