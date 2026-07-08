/* =========================================================
   ISG Voucher System — Shared Auth / Session Helper (client-side)
   NOTE: This is a client-side demo-grade auth suitable for a
   static-site architecture. Passwords are SHA-256 hashed before
   being compared/stored, but true secret-key security requires
   a real backend. See README for production hardening notes.
   ========================================================= */
const ISG_AUTH = (() => {
  const KEY = 'isg_session_v1';

  function getSession() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function setSession(sess) {
    localStorage.setItem(KEY, JSON.stringify(sess));
  }
  function clearSession() {
    localStorage.removeItem(KEY);
  }

  async function login(username, password) {
    const users = await ISG_DB.all('users');
    const hash = await isgHash(password);
    const user = users.find(u => u.username?.toLowerCase() === username.toLowerCase() && !u.deleted);
    if (!user) throw new Error('Username tidak ditemukan');
    if (user.active === false) throw new Error('Akun tidak aktif, hubungi admin');
    if (user.password_hash !== hash) throw new Error('Password salah');
    const sess = { id: user.id, username: user.username, full_name: user.full_name, role: user.role, store_location: user.store_location || '', ts: Date.now() };
    setSession(sess);
    await ISG_DB.log(user.full_name || user.username, user.role, 'LOGIN', `User ${user.username} login ke sistem`);
    return sess;
  }

  function requireRole(roles, redirectTo = 'login.html') {
    const sess = getSession();
    if (!sess || !roles.includes(sess.role)) {
      window.location.href = redirectTo;
      return null;
    }
    return sess;
  }

  async function logout(redirectTo = 'login.html') {
    const sess = getSession();
    if (sess) await ISG_DB.log(sess.full_name || sess.username, sess.role, 'LOGOUT', `User ${sess.username} logout`);
    clearSession();
    window.location.href = redirectTo;
  }

  return { getSession, setSession, clearSession, login, requireRole, logout };
})();
