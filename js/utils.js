/* =========================================================
   ISG Voucher System — Shared Utilities
   ========================================================= */

/* ---------- Toast Notification ---------- */
function isgToast(message, type = 'info', duration = 3500) {
  let wrap = document.querySelector('.isg-toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'isg-toast-wrap';
    document.body.appendChild(wrap);
  }
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const el = document.createElement('div');
  el.className = `isg-toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}" style="margin-right:8px;"></i>${message}`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
}

/* ---------- Loading Overlay ---------- */
function isgShowLoading(text = 'Memproses...') {
  let el = document.getElementById('isg-loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'isg-loading-overlay';
    el.className = 'isg-loading-overlay';
    el.innerHTML = `<div class="isg-spinner dark"></div><div style="font-weight:600;color:#2B2E36;font-size:14px;" id="isg-loading-text"></div>`;
    document.body.appendChild(el);
  }
  el.querySelector('#isg-loading-text').textContent = text;
  el.classList.remove('hidden');
}
function isgHideLoading() {
  const el = document.getElementById('isg-loading-overlay');
  if (el) el.classList.add('hidden');
}

/* ---------- Simple SHA-256 hashing (client-side, for demo-level auth) ---------- */
async function isgHash(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- ID Generator ---------- */
function isgGenId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ---------- Voucher code generator ---------- */
function isgGenVoucherCode(prefix = 'ISG') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${s.slice(0,4)}-${s.slice(4,8)}`;
}

/* ---------- Format Rupiah ---------- */
function isgRupiah(num) {
  num = Number(num) || 0;
  return 'Rp ' + num.toLocaleString('id-ID');
}

/* ---------- Format Date/Time (id-ID) ---------- */
function isgFormatDate(dateVal) {
  if (!dateVal) return '-';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function isgFormatDateTime(dateVal) {
  if (!dateVal) return '-';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
function isgTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function isgTimeStr() {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');
}

/* ---------- Phone normalizer (Indonesia) ---------- */
function isgNormalizePhone(phone) {
  let p = String(phone || '').replace(/[^0-9]/g, '');
  if (p.startsWith('62')) p = '0' + p.slice(2);
  if (p.startsWith('8')) p = '0' + p;
  return p;
}

/* ---------- Status label helpers ---------- */
const ISG_STATUS_LABEL = {
  belum_dibagikan: { text: 'Belum Dibagikan', cls: 'badge-gray' },
  sudah_dibagikan: { text: 'Sudah Dibagikan', cls: 'badge-blue' },
  sudah_digunakan: { text: 'Sudah Digunakan', cls: 'badge-green' },
  expired: { text: 'Kedaluwarsa', cls: 'badge-red' }
};
function isgStatusBadge(status) {
  const s = ISG_STATUS_LABEL[status] || { text: status, cls: 'badge-gray' };
  return `<span class="badge ${s.cls}">${s.text}</span>`;
}

/* ---------- Check voucher expired ---------- */
function isgIsExpired(validUntil) {
  if (!validUntil) return false;
  return new Date(validUntil).getTime() < Date.now();
}

/* ---------- Escape HTML ---------- */
function isgEscape(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

/* ---------- Debounce ---------- */
function isgDebounce(fn, wait = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/* ---------- CSV/Excel export using SheetJS ---------- */
function isgExportExcel(filename, rows, sheetName = 'Sheet1') {
  if (typeof XLSX === 'undefined') { isgToast('Library Excel belum termuat', 'error'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
