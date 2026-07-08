/* =========================================================
   ISG Voucher System — Admin Dashboard Logic
   ========================================================= */
(function () {
  const sess = ISG_AUTH.requireRole(['admin'], 'login.html');
  if (!sess) return;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // Cache
  let CAMPAIGNS = [];
  let VOUCHERS = [];
  let CLAIMS = [];
  let USERS = [];

  $('#admin-name').textContent = sess.full_name;
  $('#admin-initial').textContent = (sess.full_name || 'A').charAt(0).toUpperCase();
  $('#btn-logout').addEventListener('click', () => ISG_AUTH.logout('login.html'));

  /* ================= NAVIGATION ================= */
  const PAGE_TITLES = { dashboard: 'Dashboard', campaigns: 'Manajemen Campaign', vouchers: 'Manajemen Voucher', claims: 'Manajemen Klaim & Riwayat', users: 'Manajemen User', logs: 'Activity Log & Audit Trail' };
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      $$('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      $$('.section-page').forEach(p => p.classList.remove('active'));
      $('#page-' + item.dataset.page).classList.add('active');
      $('#page-title').textContent = PAGE_TITLES[item.dataset.page];
      loadPage(item.dataset.page);
    });
  });

  function closeModal(id) { $('#' + id).classList.remove('show'); }
  function openModal(id) { $('#' + id).classList.add('show'); }
  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  $$('.modal-overlay').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('show'); }));

  /* ================= INITIAL LOAD ================= */
  async function loadPage(page) {
    if (page === 'dashboard') return loadDashboard();
    if (page === 'campaigns') return loadCampaigns();
    if (page === 'vouchers') return loadVouchers();
    if (page === 'claims') return loadClaims();
    if (page === 'users') return loadUsers();
    if (page === 'logs') return loadLogs();
  }
  loadDashboard();

  /* =========================================================
     DASHBOARD
     ========================================================= */
  let chartActivity, chartStatus, chartCampaign;
  async function loadDashboard() {
    try {
      const [vouchers, claims, campaigns] = await Promise.all([
        ISG_DB.all('vouchers'), ISG_DB.all('claims'), ISG_DB.all('campaigns')
      ]);
      VOUCHERS = vouchers; CLAIMS = claims; CAMPAIGNS = campaigns;

      const count = (st) => vouchers.filter(v => v.status === st).length;
      $('#st-total').textContent = vouchers.length;
      $('#st-belum').textContent = count('belum_dibagikan');
      $('#st-dibagikan').textContent = count('sudah_dibagikan');
      $('#st-digunakan').textContent = count('sudah_digunakan');
      $('#st-expired').textContent = count('expired') + vouchers.filter(v => v.status !== 'sudah_digunakan' && v.status !== 'expired' && isgIsExpired(v.valid_until)).length;
      $('#st-campaigns').textContent = campaigns.filter(c => c.status === 'aktif').length;

      const today = isgTodayStr();
      $('#st-today').textContent = claims.filter(c => c.claim_date === today).length;

      const totalValue = vouchers.filter(v => v.status !== 'belum_dibagikan').reduce((a, v) => a + (Number(v.nominal) || 0), 0);
      $('#st-value').textContent = isgRupiah(totalValue);

      renderActivityChart(claims);
      renderStatusChart(vouchers);
      renderCampaignChart(vouchers, campaigns);
    } catch (e) {
      console.error(e);
      isgToast('Gagal memuat data dashboard', 'error');
    }
  }

  function renderActivityChart(claims) {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push(d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'));
    }
    const claimCounts = days.map(day => claims.filter(c => c.claim_date === day).length);
    const redeemCounts = days.map(day => claims.filter(c => c.redeem_date === day).length);
    const labels = days.map(d => d.slice(5).split('-').reverse().join('/'));

    if (chartActivity) chartActivity.destroy();
    chartActivity = new Chart($('#chart-activity'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Voucher Dibagikan', data: claimCounts, borderColor: '#E4032E', backgroundColor: 'rgba(228,3,46,0.1)', tension: 0.35, fill: true },
          { label: 'Voucher Diredeem', data: redeemCounts, borderColor: '#F5A800', backgroundColor: 'rgba(245,168,0,0.12)', tension: 0.35, fill: true }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }

  function renderStatusChart(vouchers) {
    const labels = ['Belum Dibagikan', 'Sudah Dibagikan', 'Sudah Digunakan', 'Kedaluwarsa'];
    const data = [
      vouchers.filter(v => v.status === 'belum_dibagikan').length,
      vouchers.filter(v => v.status === 'sudah_dibagikan').length,
      vouchers.filter(v => v.status === 'sudah_digunakan').length,
      vouchers.filter(v => v.status === 'expired' || isgIsExpired(v.valid_until)).length
    ];
    if (chartStatus) chartStatus.destroy();
    chartStatus = new Chart($('#chart-status'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: ['#9AA0AC', '#4A90E2', '#1FAA59', '#E4032E'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  function renderCampaignChart(vouchers, campaigns) {
    const labels = campaigns.map(c => c.name);
    const dataDibagikan = campaigns.map(c => vouchers.filter(v => v.campaign_id === c.id && v.status !== 'belum_dibagikan').length);
    const dataDigunakan = campaigns.map(c => vouchers.filter(v => v.campaign_id === c.id && v.status === 'sudah_digunakan').length);
    if (chartCampaign) chartCampaign.destroy();
    chartCampaign = new Chart($('#chart-campaign'), {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Voucher Dibagikan', data: dataDibagikan, backgroundColor: '#FFC627' },
        { label: 'Voucher Digunakan', data: dataDigunakan, backgroundColor: '#E4032E' }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }

  /* =========================================================
     CAMPAIGNS
     ========================================================= */
  async function loadCampaigns() {
    const tbody = $('#campaigns-tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Memuat...</td></tr>';
    try {
      const [campaigns, vouchers] = await Promise.all([ISG_DB.all('campaigns'), ISG_DB.all('vouchers')]);
      CAMPAIGNS = campaigns; VOUCHERS = vouchers;
      renderCampaignsTable(campaigns, vouchers);
      $('#camp-search').oninput = isgDebounce(() => {
        const q = $('#camp-search').value.toLowerCase();
        renderCampaignsTable(campaigns.filter(c => c.name.toLowerCase().includes(q)), vouchers);
      }, 250);
    } catch (e) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#c00;">Gagal memuat data</td></tr>'; }
  }

  function renderCampaignsTable(campaigns, vouchers) {
    const tbody = $('#campaigns-tbody');
    if (campaigns.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;">Belum ada campaign</td></tr>'; return; }
    tbody.innerHTML = campaigns.map(c => {
      const total = vouchers.filter(v => v.campaign_id === c.id).length;
      const linkUrl = `../customer/index.html?c=${encodeURIComponent(c.slug)}`;
      return `<tr>
        <td><b>${isgEscape(c.name)}</b></td>
        <td><code style="font-size:12px;">${isgEscape(c.slug)}</code><br><a href="${linkUrl}" target="_blank" style="font-size:11.5px;color:var(--isg-red);">Lihat link ↗</a></td>
        <td style="font-size:12.5px;">${isgFormatDate(c.start_date)} — ${isgFormatDate(c.end_date)}</td>
        <td><span class="badge ${c.status === 'aktif' ? 'badge-green' : 'badge-gray'}">${c.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span></td>
        <td>${total}</td>
        <td class="action-icons">
          <button title="Edit" onclick="ISGAdmin.editCampaign('${c.id}')"><i class="fa-solid fa-pen"></i></button>
          <button title="Hapus" class="danger" onclick="ISGAdmin.deleteCampaign('${c.id}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  }

  $('#btn-add-campaign').addEventListener('click', () => {
    $('#campaign-form').reset();
    $('#camp-id').value = '';
    $('#campaign-modal-title').textContent = 'Tambah Campaign';
    openModal('modal-campaign');
  });

  function editCampaign(id) {
    const c = CAMPAIGNS.find(x => x.id === id);
    if (!c) return;
    $('#camp-id').value = c.id;
    $('#camp-name').value = c.name || '';
    $('#camp-slug').value = c.slug || '';
    $('#camp-banner').value = c.banner_url || '';
    $('#camp-start').value = toLocalInput(c.start_date);
    $('#camp-end').value = toLocalInput(c.end_date);
    $('#camp-desc').value = stripHtml(c.description);
    $('#camp-terms').value = stripHtml(c.terms);
    $('#camp-status').value = c.status || 'aktif';
    $('#campaign-modal-title').textContent = 'Edit Campaign';
    openModal('modal-campaign');
  }
  async function deleteCampaign(id) {
    if (!confirm('Hapus campaign ini? Voucher terkait tidak akan otomatis terhapus.')) return;
    try {
      await ISG_DB.remove('campaigns', id);
      await ISG_DB.log(sess.full_name, 'admin', 'DELETE_CAMPAIGN', `Menghapus campaign ID ${id}`);
      isgToast('Campaign dihapus', 'success');
      loadCampaigns();
    } catch (e) { isgToast('Gagal menghapus campaign', 'error'); }
  }

  $('#campaign-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#camp-id').value;
    const slug = $('#camp-slug').value.trim().toLowerCase().replace(/\s+/g, '-');
    const payload = {
      name: $('#camp-name').value.trim(),
      slug,
      banner_url: $('#camp-banner').value.trim(),
      start_date: new Date($('#camp-start').value).toISOString(),
      end_date: new Date($('#camp-end').value).toISOString(),
      description: $('#camp-desc').value.trim(),
      terms: $('#camp-terms').value.trim(),
      status: $('#camp-status').value,
      created_by: sess.username
    };
    try {
      if (id) {
        await ISG_DB.update('campaigns', id, payload);
        await ISG_DB.log(sess.full_name, 'admin', 'UPDATE_CAMPAIGN', `Update campaign ${payload.name}`);
        isgToast('Campaign diperbarui', 'success');
      } else {
        payload.id = isgGenId('camp');
        await ISG_DB.create('campaigns', payload);
        await ISG_DB.log(sess.full_name, 'admin', 'CREATE_CAMPAIGN', `Membuat campaign baru ${payload.name}`);
        isgToast('Campaign berhasil dibuat', 'success');
      }
      closeModal('modal-campaign');
      loadCampaigns();
    } catch (err) { console.error(err); isgToast('Gagal menyimpan campaign', 'error'); }
  });

  /* =========================================================
     VOUCHERS
     ========================================================= */
  let voucherPage = 1;
  const VOUCHER_PER_PAGE = 15;
  let voucherFiltered = [];

  async function loadVouchers() {
    const tbody = $('#vouchers-tbody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Memuat...</td></tr>';
    try {
      const [vouchers, campaigns] = await Promise.all([ISG_DB.all('vouchers'), ISG_DB.all('campaigns')]);
      VOUCHERS = vouchers; CAMPAIGNS = campaigns;
      populateCampaignSelects();
      voucherFiltered = vouchers;
      voucherPage = 1;
      renderVouchersTable();
      $('#v-search').oninput = isgDebounce(applyVoucherFilter, 250);
      $('#v-filter-campaign').onchange = applyVoucherFilter;
      $('#v-filter-status').onchange = applyVoucherFilter;
    } catch (e) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#c00;">Gagal memuat data</td></tr>'; }
  }

  function populateCampaignSelects() {
    const opts = CAMPAIGNS.map(c => `<option value="${c.id}">${isgEscape(c.name)}</option>`).join('');
    $('#v-filter-campaign').innerHTML = '<option value="">Semua Campaign</option>' + opts;
    $('#c-filter-campaign').innerHTML = '<option value="">Semua Campaign</option>' + opts;
    $('#v-campaign-select').innerHTML = opts;
    $('#bulk-campaign-select').innerHTML = opts;
  }

  function applyVoucherFilter() {
    const q = $('#v-search').value.toLowerCase();
    const camp = $('#v-filter-campaign').value;
    const status = $('#v-filter-status').value;
    voucherFiltered = VOUCHERS.filter(v =>
      (!q || v.code.toLowerCase().includes(q) || (v.claimed_by_name || '').toLowerCase().includes(q)) &&
      (!camp || v.campaign_id === camp) &&
      (!status || v.status === status)
    );
    voucherPage = 1;
    renderVouchersTable();
  }

  function renderVouchersTable() {
    const tbody = $('#vouchers-tbody');
    if (voucherFiltered.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;">Tidak ada data</td></tr>'; $('#voucher-pagination').innerHTML = ''; return; }
    const start = (voucherPage - 1) * VOUCHER_PER_PAGE;
    const pageRows = voucherFiltered.slice(start, start + VOUCHER_PER_PAGE);
    tbody.innerHTML = pageRows.map(v => `
      <tr>
        <td><b>${isgEscape(v.code)}</b></td>
        <td>${isgEscape(v.campaign_name || '-')}</td>
        <td>${isgRupiah(v.nominal)}</td>
        <td>${isgFormatDate(v.valid_until)}</td>
        <td>${isgStatusBadge(v.status)}</td>
        <td>${isgEscape(v.claimed_by_name || '-')}</td>
        <td class="action-icons">
          <button title="QR Code" onclick="ISGAdmin.showQr('${v.code}')"><i class="fa-solid fa-qrcode"></i></button>
          <button title="Edit" onclick="ISGAdmin.editVoucher('${v.id}')"><i class="fa-solid fa-pen"></i></button>
          <button title="Hapus" class="danger" onclick="ISGAdmin.deleteVoucher('${v.id}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`).join('');

    const totalPages = Math.ceil(voucherFiltered.length / VOUCHER_PER_PAGE);
    let pagHtml = '';
    for (let i = 1; i <= totalPages; i++) pagHtml += `<button class="${i === voucherPage ? 'active' : ''}" onclick="ISGAdmin.gotoVoucherPage(${i})">${i}</button>`;
    $('#voucher-pagination').innerHTML = pagHtml;
  }
  function gotoVoucherPage(p) { voucherPage = p; renderVouchersTable(); }

  $('#btn-add-voucher').addEventListener('click', () => {
    if (CAMPAIGNS.length === 0) { isgToast('Buat campaign terlebih dahulu', 'warning'); return; }
    $('#voucher-form').reset();
    $('#v-id').value = '';
    $('#v-code').value = isgGenVoucherCode();
    $('#voucher-modal-title').textContent = 'Tambah Voucher';
    openModal('modal-voucher');
  });

  function editVoucher(id) {
    const v = VOUCHERS.find(x => x.id === id);
    if (!v) return;
    $('#v-id').value = v.id;
    $('#v-campaign-select').value = v.campaign_id;
    $('#v-code').value = v.code;
    $('#v-nominal').value = v.nominal;
    $('#v-valid').value = toLocalInput(v.valid_until);
    $('#v-terms').value = stripHtml(v.terms);
    $('#v-status').value = v.status;
    $('#voucher-modal-title').textContent = 'Edit Voucher';
    openModal('modal-voucher');
  }
  async function deleteVoucher(id) {
    if (!confirm('Hapus voucher ini?')) return;
    try {
      await ISG_DB.remove('vouchers', id);
      await ISG_DB.log(sess.full_name, 'admin', 'DELETE_VOUCHER', `Menghapus voucher ID ${id}`);
      isgToast('Voucher dihapus', 'success');
      loadVouchers();
    } catch (e) { isgToast('Gagal menghapus voucher', 'error'); }
  }
  $('#btn-gen-code').addEventListener('click', () => { $('#v-code').value = isgGenVoucherCode(); });

  $('#voucher-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#v-id').value;
    const campId = $('#v-campaign-select').value;
    const camp = CAMPAIGNS.find(c => c.id === campId);
    const payload = {
      campaign_id: campId,
      campaign_name: camp ? camp.name : '',
      code: $('#v-code').value.trim().toUpperCase(),
      nominal: Number($('#v-nominal').value),
      valid_until: new Date($('#v-valid').value).toISOString(),
      terms: $('#v-terms').value.trim(),
      status: $('#v-status').value
    };
    try {
      // Ensure code unique
      const dup = VOUCHERS.find(v => v.code.toUpperCase() === payload.code && v.id !== id);
      if (dup) { isgToast('Kode voucher sudah digunakan', 'error'); return; }

      if (id) {
        await ISG_DB.update('vouchers', id, payload);
        await ISG_DB.log(sess.full_name, 'admin', 'UPDATE_VOUCHER', `Update voucher ${payload.code}`);
        isgToast('Voucher diperbarui', 'success');
      } else {
        payload.id = isgGenId('vch');
        await ISG_DB.create('vouchers', payload);
        await ISG_DB.log(sess.full_name, 'admin', 'CREATE_VOUCHER', `Membuat voucher baru ${payload.code}`);
        isgToast('Voucher berhasil dibuat', 'success');
      }
      closeModal('modal-voucher');
      loadVouchers();
    } catch (err) { console.error(err); isgToast('Gagal menyimpan voucher', 'error'); }
  });

  function showQr(code) {
    $('#qr-code-render').innerHTML = '';
    new QRCode($('#qr-code-render'), { text: code, width: 180, height: 180 });
    $('#qr-code-text').textContent = code;
    openModal('modal-qr');
  }

  /* ---------- Bulk generate ---------- */
  // Add bulk generate trigger via a keyboard shortcut button injection near add voucher
  const bulkBtn = document.createElement('button');
  bulkBtn.className = 'btn btn-secondary btn-sm';
  bulkBtn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Generate Massal';
  bulkBtn.addEventListener('click', () => {
    if (CAMPAIGNS.length === 0) { isgToast('Buat campaign terlebih dahulu', 'warning'); return; }
    $('#bulk-form').reset();
    openModal('modal-bulk');
  });
  // Script is loaded at the end of <body>, so DOM is already ready — insert immediately.
  $('#btn-add-voucher').insertAdjacentElement('beforebegin', bulkBtn);

  $('#bulk-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const campId = $('#bulk-campaign-select').value;
    const camp = CAMPAIGNS.find(c => c.id === campId);
    const count = Number($('#bulk-count').value);
    const nominal = Number($('#bulk-nominal').value);
    const validUntil = new Date($('#bulk-valid').value).toISOString();
    const terms = $('#bulk-terms').value.trim();

    isgShowLoading(`Membuat ${count} voucher...`);
    try {
      const existingCodes = new Set(VOUCHERS.map(v => v.code));
      for (let i = 0; i < count; i++) {
        let code;
        do { code = isgGenVoucherCode(); } while (existingCodes.has(code));
        existingCodes.add(code);
        await ISG_DB.create('vouchers', {
          id: isgGenId('vch'), campaign_id: campId, campaign_name: camp ? camp.name : '',
          code, nominal, valid_until: validUntil, terms, status: 'belum_dibagikan'
        });
      }
      await ISG_DB.log(sess.full_name, 'admin', 'BULK_GENERATE_VOUCHER', `Generate ${count} voucher untuk campaign ${camp ? camp.name : campId}`);
      isgHideLoading();
      isgToast(`${count} voucher berhasil dibuat`, 'success');
      closeModal('modal-bulk');
      loadVouchers();
    } catch (err) { isgHideLoading(); console.error(err); isgToast('Gagal generate voucher massal', 'error'); }
  });

  /* ---------- Export / Import Excel ---------- */
  $('#btn-export-voucher').addEventListener('click', () => {
    const rows = voucherFiltered.map(v => ({
      'ID Voucher': v.id, 'Kode Voucher': v.code, 'Campaign': v.campaign_name, 'Nominal': v.nominal,
      'Masa Berlaku': isgFormatDate(v.valid_until), 'Syarat': stripHtml(v.terms), 'Status': v.status,
      'Nama Pelanggan': v.claimed_by_name || '', 'No HP': v.claimed_by_phone || '', 'No Invoice': v.claimed_by_invoice || ''
    }));
    isgExportExcel(`Voucher_ISG_${isgTodayStr()}.xlsx`, rows, 'Voucher');
  });

  $('#btn-import-voucher').addEventListener('click', () => $('#import-voucher-file').click());
  $('#import-voucher-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (CAMPAIGNS.length === 0) { isgToast('Buat campaign terlebih dahulu', 'warning'); return; }
    isgShowLoading('Membaca file Excel...');
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      let success = 0, failed = 0;
      const existingCodes = new Set(VOUCHERS.map(v => v.code));
      for (const row of rows) {
        try {
          const campaignName = row['Campaign'] || row['campaign'] || row['Nama Campaign'];
          const camp = CAMPAIGNS.find(c => c.name.toLowerCase() === String(campaignName || '').toLowerCase()) || CAMPAIGNS[0];
          let code = String(row['Kode Voucher'] || row['code'] || '').trim().toUpperCase();
          if (!code) code = isgGenVoucherCode();
          if (existingCodes.has(code)) { failed++; continue; }
          existingCodes.add(code);
          const nominal = Number(row['Nominal'] || row['nominal'] || 0);
          const validRaw = row['Masa Berlaku'] || row['valid_until'];
          const validDate = validRaw ? new Date(validRaw) : new Date(Date.now() + 30 * 86400000);
          await ISG_DB.create('vouchers', {
            id: isgGenId('vch'), campaign_id: camp.id, campaign_name: camp.name,
            code, nominal, valid_until: isNaN(validDate.getTime()) ? new Date(Date.now()+30*86400000).toISOString() : validDate.toISOString(),
            terms: row['Syarat'] || row['terms'] || '', status: 'belum_dibagikan'
          });
          success++;
        } catch (err) { failed++; }
      }
      await ISG_DB.log(sess.full_name, 'admin', 'IMPORT_VOUCHER_EXCEL', `Import ${success} voucher berhasil, ${failed} gagal`);
      isgHideLoading();
      isgToast(`Import selesai: ${success} berhasil, ${failed} gagal/duplikat`, success > 0 ? 'success' : 'warning');
      loadVouchers();
    } catch (err) { isgHideLoading(); console.error(err); isgToast('Gagal membaca file Excel', 'error'); }
    e.target.value = '';
  });

  /* =========================================================
     CLAIMS
     ========================================================= */
  let claimsFiltered = [];
  let claimsPage = 1;
  const CLAIMS_PER_PAGE = 15;

  async function loadClaims() {
    const tbody = $('#claims-tbody');
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Memuat...</td></tr>';
    try {
      const [claims, campaigns] = await Promise.all([ISG_DB.all('claims'), ISG_DB.all('campaigns')]);
      CLAIMS = claims; CAMPAIGNS = campaigns;
      populateCampaignSelects();
      claimsFiltered = claims;
      claimsPage = 1;
      renderClaimsTable();
      $('#c-search').oninput = isgDebounce(applyClaimsFilter, 250);
      $('#c-filter-campaign').onchange = applyClaimsFilter;
      $('#c-filter-status').onchange = applyClaimsFilter;
      $('#c-filter-date').onchange = applyClaimsFilter;
    } catch (e) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#c00;">Gagal memuat data</td></tr>'; }
  }

  function applyClaimsFilter() {
    const q = $('#c-search').value.toLowerCase();
    const camp = $('#c-filter-campaign').value;
    const status = $('#c-filter-status').value;
    const date = $('#c-filter-date').value;
    claimsFiltered = CLAIMS.filter(c =>
      (!q || c.customer_name.toLowerCase().includes(q) || c.phone.includes(q) || c.invoice_number.toLowerCase().includes(q)) &&
      (!camp || c.campaign_id === camp) &&
      (!status || c.status === status) &&
      (!date || c.claim_date === date || c.redeem_date === date)
    );
    claimsPage = 1;
    renderClaimsTable();
  }

  function renderClaimsTable() {
    const tbody = $('#claims-tbody');
    if (claimsFiltered.length === 0) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#999;">Tidak ada data</td></tr>'; $('#claims-pagination').innerHTML = ''; return; }
    const sorted = [...claimsFiltered].sort((a, b) => (b.claim_date + b.claim_time).localeCompare(a.claim_date + a.claim_time));
    const start = (claimsPage - 1) * CLAIMS_PER_PAGE;
    const pageRows = sorted.slice(start, start + CLAIMS_PER_PAGE);
    tbody.innerHTML = pageRows.map(c => `
      <tr>
        <td>${isgEscape(c.customer_name)}</td>
        <td>${isgEscape(c.phone)}</td>
        <td>${isgEscape(c.invoice_number)}</td>
        <td>${isgEscape(c.campaign_name)}</td>
        <td><b>${isgEscape(c.voucher_code)}</b></td>
        <td>${isgRupiah(c.nominal)}</td>
        <td>${isgStatusBadge(c.status)}</td>
        <td style="font-size:12px;">${isgEscape(c.claim_date)} ${isgEscape(c.claim_time)}</td>
        <td style="font-size:12px;">${c.redeem_date ? isgEscape(c.redeem_date) + ' ' + isgEscape(c.redeem_time) + '<br>' + isgEscape(c.officer_name||'') : '-'}</td>
      </tr>`).join('');

    const totalPages = Math.ceil(claimsFiltered.length / CLAIMS_PER_PAGE);
    let pagHtml = '';
    for (let i = 1; i <= totalPages; i++) pagHtml += `<button class="${i === claimsPage ? 'active' : ''}" onclick="ISGAdmin.gotoClaimsPage(${i})">${i}</button>`;
    $('#claims-pagination').innerHTML = pagHtml;
  }
  function gotoClaimsPage(p) { claimsPage = p; renderClaimsTable(); }

  $('#btn-export-claims').addEventListener('click', () => {
    const rows = claimsFiltered.map(c => ({
      'Nama Pelanggan': c.customer_name, 'No HP': c.phone, 'No Invoice': c.invoice_number,
      'Campaign': c.campaign_name, 'Kode Voucher': c.voucher_code, 'Nominal': c.nominal, 'Status': c.status,
      'Tanggal Klaim': c.claim_date, 'Jam Klaim': c.claim_time,
      'Tanggal Redeem': c.redeem_date || '', 'Jam Redeem': c.redeem_time || '',
      'Nama Petugas': c.officer_name || '', 'Lokasi Toko': c.store_location || ''
    }));
    isgExportExcel(`Klaim_Voucher_ISG_${isgTodayStr()}.xlsx`, rows, 'Klaim');
  });

  /* =========================================================
     USERS
     ========================================================= */
  async function loadUsers() {
    const tbody = $('#users-tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Memuat...</td></tr>';
    try {
      USERS = await ISG_DB.all('users');
      renderUsersTable(USERS);
      $('#u-search').oninput = isgDebounce(() => {
        const q = $('#u-search').value.toLowerCase();
        renderUsersTable(USERS.filter(u => u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)));
      }, 250);
    } catch (e) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#c00;">Gagal memuat data</td></tr>'; }
  }
  const ROLE_LABEL = { admin: 'Administrator', cso: 'CSO', kasir: 'Kasir' };
  function renderUsersTable(users) {
    const tbody = $('#users-tbody');
    if (users.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;">Belum ada user</td></tr>'; return; }
    tbody.innerHTML = users.map(u => `
      <tr>
        <td><b>${isgEscape(u.full_name)}</b></td>
        <td>${isgEscape(u.username)}</td>
        <td><span class="badge badge-blue">${ROLE_LABEL[u.role] || u.role}</span></td>
        <td>${isgEscape(u.store_location || '-')}</td>
        <td><span class="badge ${u.active !== false ? 'badge-green' : 'badge-gray'}">${u.active !== false ? 'Aktif' : 'Nonaktif'}</span></td>
        <td class="action-icons">
          <button title="Edit" onclick="ISGAdmin.editUser('${u.id}')"><i class="fa-solid fa-pen"></i></button>
          <button title="Hapus" class="danger" onclick="ISGAdmin.deleteUser('${u.id}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`).join('');
  }

  $('#btn-add-user').addEventListener('click', () => {
    $('#user-form').reset();
    $('#u-id').value = '';
    $('#u-active').checked = true;
    $('#user-modal-title').textContent = 'Tambah User';
    $('#u-password').required = true;
    $('#u-pass-hint').textContent = '*';
    openModal('modal-user');
  });

  function editUser(id) {
    const u = USERS.find(x => x.id === id);
    if (!u) return;
    $('#u-id').value = u.id;
    $('#u-fullname').value = u.full_name;
    $('#u-username').value = u.username;
    $('#u-password').value = '';
    $('#u-password').required = false;
    $('#u-pass-hint').textContent = '(opsional)';
    $('#u-role').value = u.role;
    $('#u-location').value = u.store_location || '';
    $('#u-active').checked = u.active !== false;
    $('#user-modal-title').textContent = 'Edit User';
    openModal('modal-user');
  }
  async function deleteUser(id) {
    if (id === sess.id) { isgToast('Tidak dapat menghapus akun sendiri', 'warning'); return; }
    if (!confirm('Hapus user ini?')) return;
    try {
      await ISG_DB.remove('users', id);
      await ISG_DB.log(sess.full_name, 'admin', 'DELETE_USER', `Menghapus user ID ${id}`);
      isgToast('User dihapus', 'success');
      loadUsers();
    } catch (e) { isgToast('Gagal menghapus user', 'error'); }
  }

  $('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#u-id').value;
    const username = $('#u-username').value.trim();
    const dup = USERS.find(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== id);
    if (dup) { isgToast('Username sudah digunakan', 'error'); return; }

    const payload = {
      full_name: $('#u-fullname').value.trim(),
      username,
      role: $('#u-role').value,
      store_location: $('#u-location').value.trim(),
      active: $('#u-active').checked
    };
    const pass = $('#u-password').value;
    try {
      if (pass) payload.password_hash = await isgHash(pass);
      if (id) {
        await ISG_DB.update('users', id, payload);
        await ISG_DB.log(sess.full_name, 'admin', 'UPDATE_USER', `Update user ${payload.username}`);
        isgToast('User diperbarui', 'success');
      } else {
        payload.id = isgGenId('usr');
        await ISG_DB.create('users', payload);
        await ISG_DB.log(sess.full_name, 'admin', 'CREATE_USER', `Membuat user baru ${payload.username} (${payload.role})`);
        isgToast('User berhasil dibuat', 'success');
      }
      closeModal('modal-user');
      loadUsers();
    } catch (err) { console.error(err); isgToast('Gagal menyimpan user', 'error'); }
  });

  /* =========================================================
     ACTIVITY LOGS
     ========================================================= */
  async function loadLogs() {
    const tbody = $('#logs-tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Memuat...</td></tr>';
    try {
      let logs = await ISG_DB.all('activity_logs');
      logs.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      renderLogsTable(logs);
      $('#log-search').oninput = isgDebounce(() => {
        const q = $('#log-search').value.toLowerCase();
        renderLogsTable(logs.filter(l => (l.actor||'').toLowerCase().includes(q) || (l.action||'').toLowerCase().includes(q) || (l.detail||'').toLowerCase().includes(q)));
      }, 250);
      $('#btn-refresh-log').onclick = loadLogs;
    } catch (e) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#c00;">Gagal memuat data</td></tr>'; }
  }
  function renderLogsTable(logs) {
    const tbody = $('#logs-tbody');
    if (logs.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;">Belum ada log</td></tr>'; return; }
    tbody.innerHTML = logs.slice(0, 300).map(l => `
      <tr>
        <td style="font-size:12px;">${isgFormatDateTime(l.created_at)}</td>
        <td>${isgEscape(l.actor)}</td>
        <td><span class="badge badge-blue">${isgEscape(l.role)}</span></td>
        <td><b>${isgEscape(l.action)}</b></td>
        <td style="font-size:12.5px;">${isgEscape(l.detail)}</td>
      </tr>`).join('');
  }

  /* ================= Helpers ================= */
  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function stripHtml(str) { return String(str || '').replace(/<[^>]*>/g, ''); }

  // Expose functions used via inline onclick
  window.ISGAdmin = {
    editCampaign, deleteCampaign, editVoucher, deleteVoucher, showQr, gotoVoucherPage,
    editUser, deleteUser, gotoClaimsPage
  };

})();
