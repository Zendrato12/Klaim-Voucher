/* =========================================================
   ISG Klaim Voucher — CSO / Kasir Logic
   ========================================================= */
(function () {
  const sess = ISG_AUTH.requireRole(['cso', 'kasir'], 'login.html');
  if (!sess) return;

  const $ = (s) => document.querySelector(s);
  let html5QrCode = null;
  let scanning = false;
  let currentVoucher = null;

  // ---------- Header ----------
  $('#officer-name').textContent = `${sess.full_name} (${sess.role === 'cso' ? 'CSO' : 'Kasir'})`;
  $('#officer-initial').textContent = (sess.full_name || '?').charAt(0).toUpperCase();
  $('#btn-logout').addEventListener('click', () => ISG_AUTH.logout('login.html'));

  // ---------- Tabs ----------
  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'history') loadHistory();
    });
  });

  // ---------- QR Scanner ----------
  $('#btn-toggle-scan').addEventListener('click', async () => {
    if (!scanning) {
      try {
        html5QrCode = new Html5Qrcode('qr-reader');
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 220 },
          (decodedText) => { onScanSuccess(decodedText); },
          () => {}
        );
        scanning = true;
        $('#btn-toggle-scan').innerHTML = '<i class="fa-solid fa-stop"></i> Hentikan Kamera';
      } catch (err) {
        isgToast('Tidak dapat mengakses kamera: ' + err, 'error');
      }
    } else {
      await stopScanner();
    }
  });

  async function stopScanner() {
    if (html5QrCode && scanning) {
      try { await html5QrCode.stop(); html5QrCode.clear(); } catch (e) {}
    }
    scanning = false;
    $('#btn-toggle-scan').innerHTML = '<i class="fa-solid fa-camera-rotate"></i> Mulai Kamera';
  }

  async function onScanSuccess(text) {
    await stopScanner();
    isgToast('QR terdeteksi: ' + text, 'success', 2000);
    lookupVoucher(text.trim());
  }

  // ---------- Manual search ----------
  $('#btn-search-code').addEventListener('click', () => {
    const code = $('#f-manual-code').value.trim();
    if (!code) { isgToast('Masukkan kode voucher', 'warning'); return; }
    lookupVoucher(code);
  });
  $('#f-manual-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-search-code').click(); });

  // ---------- Lookup Voucher ----------
  async function lookupVoucher(code) {
    isgShowLoading('Mencari voucher...');
    try {
      const vouchers = await ISG_DB.all('vouchers');
      const v = vouchers.find(x => x.code.toLowerCase() === code.toLowerCase());
      isgHideLoading();
      if (!v) { isgToast('Voucher tidak ditemukan', 'error'); return; }
      currentVoucher = v;
      renderVoucherDetail(v);
    } catch (e) {
      isgHideLoading();
      isgToast('Gagal mencari voucher', 'error');
    }
  }

  function renderVoucherDetail(v) {
    $('#vd-empty').style.display = 'none';
    $('#voucher-detail').classList.add('show');
    $('#vd-code').textContent = v.code;
    $('#vd-nominal').textContent = isgRupiah(v.nominal);
    $('#vd-name').textContent = v.claimed_by_name || '-';
    $('#vd-phone').textContent = v.claimed_by_phone || '-';
    $('#vd-campaign').textContent = v.campaign_name || '-';
    $('#vd-valid').textContent = isgFormatDate(v.valid_until);
    $('#vd-terms').textContent = (v.terms || '-').replace(/<[^>]*>/g, '');

    const rejectBox = $('#reject-box'); const successBox = $('#success-box'); const btnRedeem = $('#btn-redeem');
    rejectBox.style.display = 'none'; successBox.style.display = 'none'; btnRedeem.style.display = 'inline-flex';

    let statusHtml = isgStatusBadge(v.status);
    $('#vd-status-badge').innerHTML = statusHtml;

    const expired = isgIsExpired(v.valid_until);

    if (v.status === 'sudah_digunakan') {
      rejectBox.style.display = 'block';
      rejectBox.textContent = `⛔ Voucher ini SUDAH DIGUNAKAN pada ${isgFormatDateTime(v.redeemed_at)} oleh ${v.redeemed_by || '-'}.`;
      btnRedeem.style.display = 'none';
    } else if (v.status === 'expired' || expired) {
      rejectBox.style.display = 'block';
      rejectBox.textContent = `⛔ Voucher ini SUDAH KEDALUWARSA (berlaku hingga ${isgFormatDate(v.valid_until)}).`;
      btnRedeem.style.display = 'none';
    } else if (v.status === 'belum_dibagikan') {
      rejectBox.style.display = 'block';
      rejectBox.textContent = `⚠️ Voucher ini belum pernah dibagikan ke pelanggan manapun. Tidak dapat diredeem.`;
      btnRedeem.style.display = 'none';
    } else if (v.status === 'sudah_dibagikan') {
      // valid to redeem
    }
  }

  $('#btn-redeem').addEventListener('click', async () => {
    if (!currentVoucher) return;
    const btn = $('#btn-redeem');
    btn.disabled = true; btn.innerHTML = '<div class="isg-spinner"></div> Memproses...';
    try {
      // re-check latest status to avoid race condition (anti duplicate redeem)
      const latest = await ISG_DB.get('vouchers', currentVoucher.id);
      if (latest.status !== 'sudah_dibagikan') {
        isgToast('Status voucher sudah berubah, silakan scan ulang', 'warning');
        lookupVoucher(latest.code);
        return;
      }
      const now = new Date().toISOString();
      await ISG_DB.update('vouchers', currentVoucher.id, {
        status: 'sudah_digunakan',
        redeemed_at: now,
        redeemed_by: sess.full_name,
        redeem_location: sess.store_location || ''
      });

      // update matching claim record
      const claims = await ISG_DB.all('claims');
      const claim = claims.find(c => c.voucher_id === currentVoucher.id);
      if (claim) {
        await ISG_DB.update('claims', claim.id, {
          status: 'sudah_digunakan',
          redeem_date: isgTodayStr(),
          redeem_time: isgTimeStr(),
          officer_name: sess.full_name,
          store_location: sess.store_location || ''
        });
      }
      await ISG_DB.log(sess.full_name, sess.role, 'REDEEM_VOUCHER', `Redeem voucher ${currentVoucher.code} (${isgRupiah(currentVoucher.nominal)}) milik ${currentVoucher.claimed_by_name}`);

      $('#success-box').style.display = 'block';
      $('#success-box').textContent = `✅ Voucher berhasil diklaim/digunakan oleh ${sess.full_name} pada ${isgFormatDateTime(now)}.`;
      $('#reject-box').style.display = 'none';
      btn.style.display = 'none';
      isgToast('Voucher berhasil diredeem!', 'success');
    } catch (e) {
      console.error(e);
      isgToast('Gagal memproses klaim voucher', 'error');
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Klaim Voucher (Tandai Digunakan)';
    }
  });

  $('#btn-reset-scan').addEventListener('click', () => {
    currentVoucher = null;
    $('#voucher-detail').classList.remove('show');
    $('#vd-empty').style.display = 'block';
    $('#f-manual-code').value = '';
  });

  // ---------- History ----------
  async function loadHistory() {
    const tbody = $('#history-tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;">Memuat data...</td></tr>';
    try {
      const claims = await ISG_DB.all('claims');
      const mine = claims.filter(c => c.status === 'sudah_digunakan' && c.officer_name === sess.full_name);
      const today = isgTodayStr();
      $('#stat-today').textContent = mine.filter(c => c.redeem_date === today).length;
      $('#stat-total').textContent = mine.length;
      $('#stat-value').textContent = isgRupiah(mine.reduce((a, c) => a + (Number(c.nominal) || 0), 0));

      renderHistoryTable(mine);

      $('#hist-search').oninput = isgDebounce(() => filterHistory(mine), 250);
      $('#hist-date').onchange = () => filterHistory(mine);
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#c00;">Gagal memuat riwayat</td></tr>';
    }
  }
  function filterHistory(mine) {
    const q = $('#hist-search').value.toLowerCase();
    const date = $('#hist-date').value;
    const filtered = mine.filter(c =>
      (!q || c.voucher_code.toLowerCase().includes(q) || c.customer_name.toLowerCase().includes(q)) &&
      (!date || c.redeem_date === date)
    );
    renderHistoryTable(filtered);
  }
  function renderHistoryTable(rows) {
    const tbody = $('#history-tbody');
    if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;">Belum ada riwayat</td></tr>'; return; }
    rows.sort((a, b) => (b.redeem_date + b.redeem_time).localeCompare(a.redeem_date + a.redeem_time));
    tbody.innerHTML = rows.map(c => `
      <tr>
        <td>${isgEscape(c.redeem_date)} ${isgEscape(c.redeem_time)}</td>
        <td><b>${isgEscape(c.voucher_code)}</b></td>
        <td>${isgEscape(c.customer_name)}</td>
        <td>${isgEscape(c.campaign_name)}</td>
        <td>${isgRupiah(c.nominal)}</td>
        <td>${isgEscape(c.officer_name)}</td>
      </tr>`).join('');
  }
  $('#btn-refresh-history').addEventListener('click', loadHistory);

})();
