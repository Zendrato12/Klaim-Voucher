# Sistem Voucher Digital — Indo Super Grosir (ISG)

Sistem 3-in-1 untuk program **Spin Voucher** Indo Super Grosir, terdiri dari 3 portal terpisah yang berbagi **database real-time yang sama**:

| Portal | Folder | Pengguna | Fungsi Utama |
|---|---|---|---|
| **Spin Voucher** | `/customer/` | Pelanggan (publik) | Isi data, spin roda, dapat voucher digital |
| **Klaim Voucher** | `/cso/` | CSO / Kasir | Login, scan/cari voucher, redeem voucher |
| **Dashboard Admin** | `/admin/` | Administrator | Kelola campaign, voucher, klaim, user, laporan |

Portal utama (halaman pemilihan) ada di **`index.html`** (root).

---

## 1. Fitur yang Sudah Diimplementasikan

### 🎯 Website Customer (`/customer/index.html`)
- Banner promo & countdown periode campaign otomatis (ambil dari data campaign).
- Tampilan Syarat & Ketentuan dinamis per campaign.
- Form data diri (nama, No. HP, No. Invoice, upload nama file struk opsional) + checklist S&K.
- **Validasi anti-duplikasi**: 1 No. HP hanya 1x klaim per campaign, 1 No. Invoice hanya 1x pakai (dicek ke database sebelum & saat spin — anti race condition).
- **Animasi Spin Wheel** halus (CSS transition + easing), confetti saat menang, glow effect saat berputar.
- Pengambilan voucher **acak** dari voucher berstatus `belum_dibagikan` pada campaign terkait → otomatis berubah `sudah_dibagikan`.
- Kartu voucher digital lengkap: QR Code, Barcode (Code128), nominal, kode, masa berlaku, syarat.
- Tombol **Download voucher** (PNG, via html2canvas).
- Anti refresh-exploit: status "sudah spin" disimpan di `localStorage` per campaign + validasi ulang ke server.
- Mendukung banyak campaign via parameter URL: `customer/index.html?c=nama-slug` (mis. `?c=avian99`, `?c=bazar`, `?c=grandopening`).

### 🧾 Website Klaim Voucher / CSO-Kasir (`/cso/`)
- **Login khusus petugas** (`login.html`) dengan role `cso` / `kasir`, session tersimpan di `localStorage`.
- **Scan QR Code** via kamera (html5-qrcode) + **input kode manual**.
- Tampilan detail voucher: nama pelanggan, nominal, status, masa berlaku, syarat.
- Validasi status: menolak voucher yang **sudah digunakan**, **kedaluwarsa**, atau **belum dibagikan** (dengan pesan jelas).
- Tombol **Klaim Voucher** → mengubah status jadi `sudah_digunakan` + mencatat waktu, nama petugas, lokasi toko.
- **Re-check status di server sebelum redeem** (mencegah double-redeem/race condition).
- Riwayat klaim yang sudah diproses petugas tersebut (statistik + tabel + pencarian + filter tanggal).
- Petugas **tidak bisa** mengedit database voucher/campaign atau mengakses pengaturan sistem (dibatasi navigasi & RBAC halaman).

### 🛠️ Dashboard Admin (`/admin/`)
- **Login admin** terpisah (role `admin` saja).
- **Dashboard**: total voucher, belum/sudah dibagikan, sudah digunakan, kedaluwarsa, total klaim hari ini, total nilai voucher dibagikan, grafik aktivitas klaim 14 hari (Chart.js), distribusi status (doughnut), statistik per campaign (bar chart).
- **Manajemen Campaign**: CRUD lengkap, banner, periode (start/end), S&K, status aktif/nonaktif, link Spin Voucher otomatis per slug.
- **Manajemen Voucher**: CRUD, generate kode otomatis, **generate massal** (bulk create), ubah status manual, **Generate/lihat QR Code**, **Import dari Excel**, **Export ke Excel** (SheetJS/XLSX), filter by campaign/status, pencarian, pagination.
- **Manajemen Klaim**: daftar seluruh klaim & riwayat redeem, filter tanggal/campaign/status, pencarian nama/HP/invoice, **Export ke Excel**, pagination.
- **Manajemen User**: CRUD akun `admin`/`cso`/`kasir`, password di-hash (SHA-256) sebelum disimpan, status aktif/nonaktif, tidak bisa hapus akun sendiri.
- **Activity Log**: audit trail semua aksi penting (login/logout, create/update/delete campaign & voucher & user, spin, redeem, import massal) dengan waktu, pelaku, role, detail.

### 🎨 Desain
- Identitas visual ISG: merah (`#E4032E`), kuning/emas (`#FFC627`), putih.
- Font Poppins, Font Awesome icons, fully responsive (mobile-friendly) di ketiga portal.
- Animasi spin wheel, confetti, toast notification, loading overlay yang konsisten di seluruh sistem (`css/theme.css`, `js/utils.js`).

---

## 2. Struktur URL / Entry Point

```
/index.html                                 → Portal utama (pilih Customer/CSO/Admin)

/customer/index.html                        → Spin Voucher (pakai campaign aktif pertama jika tanpa slug)
/customer/index.html?c=grandopening          → Spin Voucher khusus campaign "grandopening"
/customer/index.html?c=avian99               → Spin Voucher khusus campaign "avian99"
/customer/index.html?c=bazar                 → Spin Voucher khusus campaign "bazar"

/cso/login.html                              → Login petugas CSO/Kasir
/cso/index.html                              → Dashboard petugas (scan & klaim + riwayat) — perlu login

/admin/login.html                            → Login administrator
/admin/index.html                            → Dashboard admin lengkap — perlu login
```

> Saat deploy ke domain sungguhan (`voucher.`, `claim.`, `admin.indosupergrosir.com`), Anda bisa mengarahkan masing-masing subdomain via reverse proxy/redirect ke folder `/customer/`, `/cso/`, `/admin/` — atau tetap menggunakan path seperti di atas pada satu domain.

### Akun Demo (dari proses seeding awal)
| Role | Username | Password |
|---|---|---|
| Administrator | `admin` | `admin123` |
| CSO | `cso1` | `cso123` |
| Kasir | `kasir1` | `kasir123` |

### Campaign Demo
- `grandopening` — Grand Opening ISG Solo Baru (aktif, 25 voucher demo tersedia: Rp10.000–Rp100.000)
- `avian99` — Promo Avian 99 (aktif, belum ada voucher, tambahkan lewat Admin)
- `bazar` — Bazar Akhir Tahun (aktif, belum ada voucher, tambahkan lewat Admin)

**⚠️ Silakan ganti password demo di atas setelah go-live**, melalui menu Manajemen User di Dashboard Admin.

---

## 3. Model Data (Tabel)

Disimpan melalui **RESTful Table API** bawaan platform (`tables/{nama_tabel}`), berfungsi sebagai database real-time bersama untuk ketiga portal.

### `campaigns`
id, name, slug, banner_url, start_date, end_date, terms, description, status (`aktif`/`nonaktif`), created_by

### `vouchers`
id, code, campaign_id, campaign_name, nominal, valid_until, terms, status (`belum_dibagikan`/`sudah_dibagikan`/`sudah_digunakan`/`expired`), claimed_by_name, claimed_by_phone, claimed_by_invoice, claimed_at, redeemed_at, redeemed_by, redeem_location

### `claims`
id, campaign_id, campaign_name, customer_name, phone, invoice_number, receipt_note, voucher_id, voucher_code, nominal, status, claim_date, claim_time, redeem_date, redeem_time, officer_name, store_location

### `users`
id, username, password_hash (SHA-256), full_name, role (`admin`/`cso`/`kasir`), store_location, active

### `activity_logs`
id, actor, role, action, detail (audit trail)

---

## 4. Keamanan yang Sudah Diterapkan (Client-Side)

- Login terpisah untuk **Admin** vs **CSO/Kasir**, dengan pengecekan role saat login.
- **RBAC**: setiap portal hanya mengizinkan role yang sesuai (`ISG_AUTH.requireRole(...)`), redirect otomatis ke login jika tidak sesuai.
- Password di-hash **SHA-256** sebelum disimpan/dibandingkan (`js/utils.js → isgHash`).
- Validasi **1 No. HP = 1 klaim/campaign**, **1 No. Invoice = 1x pakai**, **1 voucher = 1 pelanggan = 1x redeem** — dicek di server data sebelum & sesudah aksi (mengurangi race condition, meski tanpa transaksi database asli).
- Validasi masa berlaku voucher (`isgIsExpired`) sebelum redeem.
- **Activity Log/Audit Trail** untuk semua aksi penting.
- Anti refresh-exploit dasar via `localStorage` flag per sesi + validasi ulang ke server.
- Link Spin Voucher otomatis nonaktif (halaman "Campaign Tidak Ditemukan/Berakhir") jika di luar periode `start_date`–`end_date` atau status `nonaktif`.

### ⚠️ Batasan Penting (Harus Dipahami)
Karena ini adalah **website statis** (tanpa server backend nyata):
- Tidak ada rahasia server (secret key, JWT signing, dsb.) — autentikasi bersifat **client-side demo-grade**, cocok untuk internal terbatas/PoC, **bukan pengganti backend enterprise sungguhan**.
- Tidak ada validasi race-condition tingkat database (row-locking) — dua request bersamaan dalam milidetik yang sama secara teoritis bisa lolos double-claim pada beban sangat tinggi. Untuk skala produksi besar, disarankan backend nyata (Node/PHP/Laravel) + database transaksional.
- Google Sheets sinkronisasi asli (via Apps Script/OAuth) **tidak dapat** dijalankan di website statis tanpa server perantara. Sebagai gantinya sistem ini memakai database **Table API** real-time bawaan platform, plus fitur **Import/Export Excel (.xlsx)** di Dashboard Admin sebagai jembatan data ke/dari Excel atau Google Sheets (upload manual export Google Sheets ke Excel, lalu import di Admin).
- Upload "Foto Struk" hanya menyimpan **nama file** sebagai catatan (tidak ada storage file server untuk gambar biner).

---

## 5. Cara Menambah Campaign Baru (Admin)

1. Login ke `/admin/login.html`.
2. Menu **Campaign** → **Tambah Campaign**. Isi nama, slug (huruf kecil tanpa spasi, mis. `bazar-hut-isg`), banner, periode, S&K.
3. Menu **Voucher** → pilih campaign tersebut → **Generate Massal** (isi jumlah, nominal, masa berlaku) atau **Tambah Voucher** satuan.
4. Bagikan link customer: `customer/index.html?c=bazar-hut-isg` ke pelanggan (bisa disingkat via link shortener/QR).

---

## 6. Fitur yang Belum Diimplementasikan / Rekomendasi Pengembangan Lanjutan

- Sinkronisasi native ke **Google Sheets API** (butuh backend/Apps Script proxy — di luar kapasitas website statis).
- Upload **foto struk** sebagai file gambar tersimpan (butuh object storage server).
- Notifikasi **WhatsApp/SMS** otomatis saat voucher didapat (butuh integrasi API pihak ketiga berbayar).
- **Multi-toko** dengan laporan performa per cabang secara terpisah (kolom lokasi sudah tersedia, dashboard breakdown per toko bisa ditambahkan).
- Backend nyata + database transaksional untuk keamanan & skala enterprise penuh (rekomendasi jika traffic sangat tinggi/multi-region).
- Two-factor authentication untuk akun Admin.
- Rate limiting / captcha pada form customer untuk mencegah bot spin.

---

## 7. Struktur File

```
index.html                 → Portal utama
css/theme.css               → Tema visual bersama (merah-kuning-putih ISG)
js/api.js                   → Wrapper RESTful Table API
js/auth.js                  → Session & login helper (RBAC)
js/utils.js                 → Toast, formatter, hashing, dll
images/                      → Logo & banner

customer/index.html         → Halaman Spin Voucher pelanggan
customer/js/spin.js          → Logic spin, validasi, voucher digital

cso/login.html               → Login petugas
cso/index.html                → Dashboard scan & klaim + riwayat
cso/js/cso.js                  → Logic scan QR, redeem, riwayat

admin/login.html              → Login admin
admin/index.html               → Dashboard admin (semua menu)
admin/js/admin.js               → Logic seluruh menu admin
```

---

## 8. Publikasi

Untuk mempublikasikan sistem ini agar dapat diakses secara online, buka tab **Publish** pada platform dan klik publish — seluruh proses deployment akan ditangani otomatis dan Anda akan mendapatkan URL live.

Setelah live, arahkan pelanggan/petugas/admin ke path masing-masing seperti tercantum di bagian **Entry Point** di atas.
