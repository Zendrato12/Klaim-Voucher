/* =========================================================
   ISG Voucher System — Shared Table API Helper
   Wraps the RESTful Table API (tables/{name}) with convenient
   CRUD + query helpers used across the 3 sub-apps.
   ========================================================= */
const ISG_DB = (() => {
  // Compute the correct base URL for the Table API regardless of which
  // subfolder (customer/, cso/, admin/) the current HTML page lives in.
  // This script is always included as ".../js/api.js" relative to the
  // project root, so we derive the root URL from its own <script src>.
  let ROOT = '';
  try {
    const scripts = document.getElementsByTagName('script');
    for (const s of scripts) {
      if (s.src && s.src.endsWith('/js/api.js')) {
        ROOT = s.src.slice(0, -'js/api.js'.length);
        break;
      }
    }
  } catch (e) { /* noop */ }
  const BASE = ROOT ? ROOT + 'tables' : 'tables';

  async function list(table, { page = 1, limit = 1000, search = '', sort = '' } = {}) {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (sort) params.set('sort', sort);
    const res = await fetch(`${BASE}/${table}?${params.toString()}`);
    if (!res.ok) throw new Error(`Gagal memuat data ${table}`);
    return res.json();
  }

  // Fetch ALL rows across pages (helper for small-ish datasets)
  async function all(table, opts = {}) {
    let page = 1;
    const limit = 1000;
    let out = [];
    while (true) {
      const res = await list(table, { ...opts, page, limit });
      out = out.concat(res.data || []);
      if (!res.data || res.data.length < limit || out.length >= (res.total || 0)) break;
      page++;
      if (page > 50) break; // safety
    }
    return out;
  }

  async function get(table, id) {
    const res = await fetch(`${BASE}/${table}/${id}`);
    if (!res.ok) throw new Error('Data tidak ditemukan');
    return res.json();
  }

  async function create(table, data) {
    const res = await fetch(`${BASE}/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Gagal membuat data ${table}`);
    return res.json();
  }

  async function update(table, id, data) {
    const res = await fetch(`${BASE}/${table}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Gagal memperbarui data ${table}`);
    return res.json();
  }

  async function remove(table, id) {
    const res = await fetch(`${BASE}/${table}/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error(`Gagal menghapus data ${table}`);
    return true;
  }

  async function log(actor, role, action, detail = '') {
    try {
      await create('activity_logs', {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        actor, role, action, detail: String(detail)
      });
    } catch (e) { console.warn('Log gagal', e); }
  }

  return { list, all, get, create, update, remove, log };
})();
