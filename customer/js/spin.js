/* =========================================================
   ISG Spin Voucher — Customer Logic
   ========================================================= */
(function () {
  let CAMPAIGN = null;
  let SELECTED_VOUCHER = null;
  let CUSTOMER = { name: '', phone: '', invoice: '', receipt: '' };
  let hasSpun = false; // anti double-spin / anti refresh exploit (session-level)

  const $ = (sel) => document.querySelector(sel);

  function getCampaignSlug() {
    const params = new URLSearchParams(window.location.search);
    let slug = params.get('c') || params.get('campaign');
    if (!slug) {
      // fallback: parse path segment e.g. /customer/avian99
      const parts = window.location.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && !last.includes('.html') && last !== 'customer') slug = last;
    }
    return slug;
  }

  function sessionKey(slug) { return `isg_spun_${slug}`; }

  async function init() {
    const slug = getCampaignSlug();
    try {
      const campaigns = await ISG_DB.all('campaigns');
      let camp = null;
      if (slug) {
        camp = campaigns.find(c => c.slug === slug);
      } else {
        // no slug given -> use first active campaign as default demo
        camp = campaigns.find(c => c.status === 'aktif');
      }
      if (!camp) return showCampaignError();

      const now = Date.now();
      const start = camp.start_date ? new Date(camp.start_date).getTime() : 0;
      const end = camp.end_date ? new Date(camp.end_date).getTime() : Infinity;
      if (camp.status !== 'aktif' || now < start || now > end) {
        return showCampaignError();
      }

      CAMPAIGN = camp;
      document.getElementById('main-app').classList.remove('hidden-block');
      document.getElementById('campaign-error').classList.add('hidden-block');
      renderCampaign(camp);
      startCountdown(end);

      // Check if this browser/session already spun for this campaign
      if (localStorage.getItem(sessionKey(camp.id))) {
        hasSpun = true;
      }
    } catch (e) {
      console.error(e);
      showCampaignError();
    }
  }

  function showCampaignError() {
    $('#campaign-error').classList.remove('hidden-block');
    $('#main-app').classList.add('hidden-block');
    document.getElementById('countdown-wrap').style.display = 'none';
  }

  function renderCampaign(camp) {
    $('#campaign-title').textContent = camp.name || 'Spin Voucher Indo Super Grosir';
    if (camp.description) $('#campaign-desc').innerHTML = camp.description;
    if (camp.banner_url) $('#campaign-banner').src = camp.banner_url;
    $('#terms-content').innerHTML = camp.terms || '<p>Tidak ada syarat & ketentuan khusus.</p>';
    document.title = `Spin Voucher — ${camp.name} | ISG`;
  }

  function startCountdown(endTs) {
    function tick() {
      const diff = endTs - Date.now();
      if (diff <= 0) { showCampaignError(); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      $('#cd-days').textContent = String(d).padStart(2, '0');
      $('#cd-hours').textContent = String(h).padStart(2, '0');
      $('#cd-min').textContent = String(m).padStart(2, '0');
      $('#cd-sec').textContent = String(s).padStart(2, '0');
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ================= FORM VALIDATION ================= */
  $('#claim-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!CAMPAIGN) return;
    $('#err-phone').style.display = 'none';
    $('#err-invoice').style.display = 'none';
    $('#form-msg').textContent = '';

    const name = $('#f-name').value.trim();
    const phoneRaw = $('#f-phone').value.trim();
    const invoice = $('#f-invoice').value.trim();
    const agree = $('#f-agree').checked;

    if (!name || !phoneRaw || !invoice || !agree) {
      isgToast('Lengkapi semua data & setujui S&K', 'warning'); return;
    }
    const phone = isgNormalizePhone(phoneRaw);
    if (phone.length < 9 || phone.length > 14) {
      $('#err-phone').textContent = 'Nomor HP tidak valid'; $('#err-phone').style.display = 'block'; return;
    }

    if (hasSpun) {
      isgToast('Nomor HP ini sudah pernah melakukan spin pada campaign ini', 'error');
      return;
    }

    const btn = $('#btn-check');
    btn.disabled = true; btn.innerHTML = '<div class="isg-spinner"></div> Memvalidasi...';

    try {
      const claims = await ISG_DB.all('claims');
      const dupPhone = claims.find(c => c.campaign_id === CAMPAIGN.id && isgNormalizePhone(c.phone) === phone);
      if (dupPhone) {
        $('#err-phone').textContent = 'Nomor HP ini sudah pernah klaim pada campaign ini';
        $('#err-phone').style.display = 'block';
        isgToast('Nomor HP sudah pernah klaim di campaign ini', 'error');
        return;
      }
      const dupInvoice = claims.find(c => c.invoice_number.toLowerCase() === invoice.toLowerCase());
      if (dupInvoice) {
        $('#err-invoice').textContent = 'Nomor invoice ini sudah pernah digunakan';
        $('#err-invoice').style.display = 'block';
        isgToast('Nomor invoice sudah pernah digunakan', 'error');
        return;
      }

      CUSTOMER = { name, phone: phoneRaw, invoice, receipt: $('#f-receipt').files[0]?.name || '' };

      // Move to spin section
      document.getElementById('form-section').classList.add('hidden-block');
      document.getElementById('spin-section').classList.remove('hidden-block');
      buildWheel();
      document.getElementById('spin-section').scrollIntoView({ behavior: 'smooth' });
      isgToast('Data valid! Silakan putar roda voucher Anda', 'success');
    } catch (err) {
      console.error(err);
      isgToast('Terjadi kesalahan validasi, coba lagi', 'error');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Cek & Lanjutkan';
    }
  });

  /* ================= WHEEL BUILD ================= */
  const WHEEL_LABELS = ['🎁 Voucher', '💰 Hemat', '🎉 Hadiah', '🛍️ Belanja', '🎁 Voucher', '⭐ Bonus', '🎉 Hadiah', '🛍️ Diskon'];
  function buildWheel() {
    const wheel = document.getElementById('wheel');
    wheel.innerHTML = '';
    const segAngle = 360 / WHEEL_LABELS.length;
    WHEEL_LABELS.forEach((label, i) => {
      const seg = document.createElement('div');
      seg.className = 'wheel-seg';
      const angle = segAngle * i + segAngle / 2;
      seg.style.transform = `rotate(${angle}deg) translate(30px,-8px)`;
      seg.textContent = label;
      wheel.appendChild(seg);
    });
  }

  /* ================= SPIN ACTION ================= */
  $('#btn-spin').addEventListener('click', async () => {
    if (hasSpun) { isgToast('Anda sudah melakukan spin', 'warning'); return; }
    const btn = $('#btn-spin');
    btn.disabled = true;
    btn.innerHTML = '<div class="isg-spinner dark"></div> Mengambil voucher...';

    try {
      // Re-verify (anti duplicate race) & fetch available vouchers
      const [claims, vouchers] = await Promise.all([
        ISG_DB.all('claims'),
        ISG_DB.all('vouchers')
      ]);
      const phoneNorm = isgNormalizePhone(CUSTOMER.phone);
      if (claims.find(c => c.campaign_id === CAMPAIGN.id && isgNormalizePhone(c.phone) === phoneNorm)) {
        isgToast('Nomor HP sudah pernah klaim (terdeteksi ulang)', 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-arrows-spin"></i> PUTAR SEKARANG';
        return;
      }

      const available = vouchers.filter(v => v.campaign_id === CAMPAIGN.id && v.status === 'belum_dibagikan' && !isgIsExpired(v.valid_until));
      if (available.length === 0) {
        isgToast('Maaf, voucher untuk campaign ini sudah habis', 'error');
        btn.innerHTML = '<i class="fa-solid fa-ban"></i> Voucher Habis';
        return;
      }

      const chosen = available[Math.floor(Math.random() * available.length)];
      SELECTED_VOUCHER = chosen;

      // Spin animation
      document.getElementById('wheel-wrap').classList.add('spinning');
      const wheel = document.getElementById('wheel');
      const randomExtra = Math.floor(Math.random() * 360);
      const totalRotation = 360 * 6 + randomExtra;
      wheel.style.transform = `rotate(${totalRotation}deg)`;

      await new Promise(res => setTimeout(res, 4700));
      document.getElementById('wheel-wrap').classList.remove('spinning');

      // Mark voucher as distributed + create claim record
      const now = new Date().toISOString();
      await ISG_DB.update('vouchers', chosen.id, {
        status: 'sudah_dibagikan',
        claimed_by_name: CUSTOMER.name,
        claimed_by_phone: CUSTOMER.phone,
        claimed_by_invoice: CUSTOMER.invoice,
        claimed_at: now
      });
      await ISG_DB.create('claims', {
        id: isgGenId('claim'),
        campaign_id: CAMPAIGN.id,
        campaign_name: CAMPAIGN.name,
        customer_name: CUSTOMER.name,
        phone: CUSTOMER.phone,
        invoice_number: CUSTOMER.invoice,
        receipt_note: CUSTOMER.receipt,
        voucher_id: chosen.id,
        voucher_code: chosen.code,
        nominal: chosen.nominal,
        status: 'sudah_dibagikan',
        claim_date: isgTodayStr(),
        claim_time: isgTimeStr()
      });
      await ISG_DB.log(CUSTOMER.name, 'customer', 'SPIN_VOUCHER', `Klaim voucher ${chosen.code} (${isgRupiah(chosen.nominal)}) pada campaign ${CAMPAIGN.name}`);

      hasSpun = true;
      localStorage.setItem(sessionKey(CAMPAIGN.id), '1');

      fireConfetti();
      showVoucherResult(chosen);
    } catch (err) {
      console.error(err);
      isgToast('Gagal memproses spin, coba lagi', 'error');
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-arrows-spin"></i> PUTAR SEKARANG';
    }
  });

  /* ================= SHOW RESULT ================= */
  function showVoucherResult(v) {
    document.getElementById('spin-section').classList.add('hidden-block');
    const resultSection = document.getElementById('result-section');
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth' });

    $('#v-nominal').textContent = isgRupiah(v.nominal);
    $('#v-code').textContent = v.code;
    $('#v-name').textContent = CUSTOMER.name;
    $('#v-campaign').textContent = CAMPAIGN.name;
    $('#v-valid').textContent = isgFormatDate(v.valid_until);
    $('#v-terms').innerHTML = v.terms || 'Berlaku di seluruh gerai ISG. Tidak dapat diuangkan.';

    document.getElementById('v-qrcode').innerHTML = '';
    new QRCode(document.getElementById('v-qrcode'), { text: v.code, width: 110, height: 110, colorDark: '#1A1A1A', colorLight: '#ffffff' });

    try {
      JsBarcode('#v-barcode', v.code, { format: 'CODE128', height: 50, width: 1.6, fontSize: 12, margin: 6 });
    } catch (e) { console.warn('barcode err', e); }
  }

  $('#btn-download').addEventListener('click', () => {
    const el = document.getElementById('voucher-card-el');
    isgShowLoading('Menyiapkan voucher...');
    html2canvas(el, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
      const link = document.createElement('a');
      link.download = `Voucher-ISG-${SELECTED_VOUCHER?.code || 'voucher'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      isgHideLoading();
    }).catch(() => { isgHideLoading(); isgToast('Gagal mengunduh voucher', 'error'); });
  });

  /* ================= CONFETTI ================= */
  function fireConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const colors = ['#E4032E', '#FFC627', '#F5A800', '#ffffff', '#B8021F'];
    const pieces = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height * 0.3,
      r: 4 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)],
      vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3, rot: Math.random() * 360, vr: -6 + Math.random() * 12
    }));
    let frame = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx.restore();
      });
      frame++;
      if (frame < 130) requestAnimationFrame(draw); else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();
  }

  init();
})();
