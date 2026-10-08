// ═══════════════════════════════════════════════════════════
//  theme.js — نظام الثيمات الشخصية | مدرسة التوحيد القرآنية
//  كل مستخدم يختار ثيم شخصي يُحفظ في Supabase (RPC set_my_theme)
//  (دفعة ١٤) الحفظ بقى عبر RPC لكل الأدوار + التحقق من النتيجة
//  + الكاش في المتصفح لكل حساب لوحده (userTheme_<auth_id>)
// ═══════════════════════════════════════════════════════════

const THEMES = {
  // ── الثيمات الداكنة (Sidebar داكن)
  forest: { label: 'الغابة الزمرد', emoji: '🌲', dark: true, vars: {
    '--primary':'#1e5c36','--primary-d':'#0f3320','--primary-l':'#2d8050','--primary-p':'#e8f5ee',
    '--accent':'#c8920a','--accent-l':'#f0b429',
    '--sb-bg':'linear-gradient(180deg,#0f2318 0%,#1e5c36 100%)',
    '--sb-active':'linear-gradient(135deg,rgba(46,128,80,.65),rgba(46,128,80,.35))',
    '--sb-active-b':'rgba(82,168,118,.3)','--sb-text':'rgba(255,255,255,.62)',
    '--bg':'#f5f7f5','--border':'#dce8e0' } },
  ocean: { label: 'المحيط الأزرق', emoji: '🌊', dark: true, vars: {
    '--primary':'#1a4a7a','--primary-d':'#0c2340','--primary-l':'#2563a8','--primary-p':'#e8f0fb',
    '--accent':'#c8920a','--accent-l':'#f0c040',
    '--sb-bg':'linear-gradient(180deg,#0c2340 0%,#1a4a7a 100%)',
    '--sb-active':'linear-gradient(135deg,rgba(37,99,168,.65),rgba(37,99,168,.35))',
    '--sb-active-b':'rgba(77,143,212,.3)','--sb-text':'rgba(255,255,255,.62)',
    '--bg':'#f3f6fb','--border':'#ccdaea' } },
  royal: { label: 'البنفسجي الملكي', emoji: '👑', dark: true, vars: {
    '--primary':'#5b3fa0','--primary-d':'#3d2878','--primary-l':'#7c5fbe','--primary-p':'#f0ebfa',
    '--accent':'#c8920a','--accent-l':'#f0b429',
    '--sb-bg':'linear-gradient(180deg,#3d2878 0%,#5b3fa0 100%)',
    '--sb-active':'linear-gradient(135deg,rgba(200,146,10,.3),rgba(200,146,10,.15))',
    '--sb-active-b':'rgba(200,146,10,.35)','--sb-text':'rgba(255,255,255,.62)',
    '--bg':'#f7f4fc','--border':'#ddd4f0' } },
  midnight: { label: 'منتصف الليل', emoji: '🌙', dark: true, vars: {
    '--primary':'#374151','--primary-d':'#1f2937','--primary-l':'#4b5563','--primary-p':'#f3f4f6',
    '--accent':'#c8920a','--accent-l':'#f0b429',
    '--sb-bg':'linear-gradient(180deg,#111827 0%,#1f2937 100%)',
    '--sb-active':'linear-gradient(135deg,rgba(200,146,10,.3),rgba(200,146,10,.12))',
    '--sb-active-b':'rgba(200,146,10,.3)','--sb-text':'rgba(255,255,255,.62)',
    '--bg':'#f6f7f8','--border':'#e0e3e8' } },
  ruby: { label: 'الياقوت الأحمر', emoji: '❤️', dark: true, vars: {
    '--primary':'#9b1c2e','--primary-d':'#6d0f1f','--primary-l':'#c0283d','--primary-p':'#fdeef0',
    '--accent':'#c8920a','--accent-l':'#f0b429',
    '--sb-bg':'linear-gradient(180deg,#6d0f1f 0%,#9b1c2e 100%)',
    '--sb-active':'linear-gradient(135deg,rgba(200,146,10,.3),rgba(200,146,10,.12))',
    '--sb-active-b':'rgba(200,146,10,.3)','--sb-text':'rgba(255,255,255,.62)',
    '--bg':'#fdf5f6','--border':'#f0d4d8' } },
  teal: { label: 'الفيروزي', emoji: '🦚', dark: true, vars: {
    '--primary':'#0f766e','--primary-d':'#0d4f49','--primary-l':'#14a099','--primary-p':'#e6faf9',
    '--accent':'#c8920a','--accent-l':'#f0b429',
    '--sb-bg':'linear-gradient(180deg,#0d4f49 0%,#0f766e 100%)',
    '--sb-active':'linear-gradient(135deg,rgba(20,160,153,.55),rgba(20,160,153,.28))',
    '--sb-active-b':'rgba(20,160,153,.35)','--sb-text':'rgba(255,255,255,.62)',
    '--bg':'#f2fafa','--border':'#c8e8e7' } },
  // ── الثيمات الفاتحة (Sidebar أبيض)
  sage: { label: 'الأخضر الحكيم', emoji: '🌿', dark: false, vars: {
    '--primary':'#2d7a50','--primary-d':'#1a5c36','--primary-l':'#3da068','--primary-p':'#eaf6f0',
    '--accent':'#c8920a','--accent-l':'#f0b429',
    '--sb-bg':'#ffffff','--sb-active':'linear-gradient(135deg,#2d7a50,#3da068)',
    '--sb-active-b':'transparent','--sb-text':'#4a6258',
    '--bg':'#f4f7f5','--border':'#d8e8df' } },
  amber: { label: 'العنبر الذهبي', emoji: '🌅', dark: false, vars: {
    '--primary':'#b45309','--primary-d':'#7c3a05','--primary-l':'#d97706','--primary-p':'#fef3e2',
    '--accent':'#1a7a4a','--accent-l':'#25a05f',
    '--sb-bg':'#ffffff','--sb-active':'linear-gradient(135deg,#b45309,#d97706)',
    '--sb-active-b':'transparent','--sb-text':'#6a4a28',
    '--bg':'#faf8f4','--border':'#e8d8c0' } },
};

// ── مفتاح الكاش: لكل حساب لوحده (عشان جهاز واحد عليه أكتر من حساب)
let _THEME_UID = '';
function _themeKey(){ return _THEME_UID ? 'userTheme_' + _THEME_UID : 'userTheme'; }
function _themeLS(k, v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k, v); }catch(e){ return null; } }
function _themeCurrent(){ const k = _themeLS(_themeKey()) || _themeLS('userTheme'); return THEMES[k] ? k : 'forest'; }

// ─────────────────────────────────────────────
//  applyTheme — يطبّق الثيم على الصفحة
// ─────────────────────────────────────────────
function applyTheme(themeKey) {
  if (!THEMES[themeKey]) themeKey = 'forest';
  const theme = THEMES[themeKey];
  const root  = document.documentElement;
  root.style.setProperty('--forest',  theme.vars['--primary-d']);
  root.style.setProperty('--emerald', theme.vars['--primary']);
  root.style.setProperty('--jade',    theme.vars['--primary-l']);
  root.style.setProperty('--mint',    theme.vars['--primary-l']);
  root.style.setProperty('--pale',    theme.vars['--primary-p']);
  root.style.setProperty('--gold',    theme.vars['--accent']);
  root.style.setProperty('--gold-l',  theme.vars['--accent-l']);
  root.style.setProperty('--bg',      theme.vars['--bg']);
  root.style.setProperty('--border',  theme.vars['--border']);
  root.style.setProperty('--sb-bg',       theme.vars['--sb-bg']);
  root.style.setProperty('--sb-active',   theme.vars['--sb-active']);
  root.style.setProperty('--sb-active-b', theme.vars['--sb-active-b']);
  root.style.setProperty('--sb-text',     theme.vars['--sb-text']);
  root.style.setProperty('--theme-dark',  theme.dark ? '1' : '0');

  const sb = document.querySelector('.sidebar');
  if (sb) {
    if (theme.dark) {
      sb.style.background = theme.vars['--sb-bg'];
      sb.style.borderLeft = 'none'; sb.style.borderRight = 'none';
      sb.style.boxShadow  = '-2px 0 24px rgba(0,0,0,.28)';
      _applyDarkSidebar(theme);
    } else {
      sb.style.background = '#ffffff';
      sb.style.borderLeft = '1px solid ' + theme.vars['--border'];
      sb.style.boxShadow  = '-2px 0 16px rgba(0,0,0,.06)';
      _applyLightSidebar(theme);
    }
  }
  document.querySelectorAll('.sb-item.active').forEach(el => {
    el.style.background  = theme.vars['--sb-active'];
    el.style.borderColor = theme.vars['--sb-active-b'];
  });
  _themeLS(_themeKey(), themeKey);
  _themeLS('userTheme', themeKey);   // patchThemeOnNav + الإقلاع السريع
}

function _applyDarkSidebar(theme) {
  const logoTitle = document.querySelector('.sb-logo-title, .sb-logo .t1');
  if (logoTitle) logoTitle.style.color = '#ffffff';
  const logoSub = document.querySelector('.sb-logo-sub, .sb-logo .t2');
  if (logoSub) logoSub.style.color = theme.vars['--accent-l'];
  document.querySelectorAll('.sb-logo, .sb-footer').forEach(el => { el.style.borderColor = 'rgba(255,255,255,.08)'; });
  const sbUser = document.querySelector('.sb-user');
  if (sbUser) { sbUser.style.background = 'rgba(255,255,255,.07)'; sbUser.style.borderColor = 'rgba(255,255,255,.11)'; }
  document.querySelectorAll('.sb-uname').forEach(el => el.style.color = '#ffffff');
  document.querySelectorAll('.sb-urole').forEach(el => {
    el.style.color = 'rgba(255,255,255,.65)'; el.style.background = 'none'; el.style.boxShadow = 'none';
    el.style.textShadow = 'none'; el.style.padding = '0'; el.style.border = 'none'; el.style.borderRadius = '0';
  });
  document.querySelectorAll('.sb-item').forEach(el => { if (!el.classList.contains('active')) el.style.color = 'rgba(255,255,255,.58)'; });
  document.querySelectorAll('.sb-section, .sb-sec').forEach(el => { el.style.color = 'rgba(255,255,255,.28)'; });
  const ayah = document.querySelector('.sb-ayah, .sb-footer-ayah');
  if (ayah) ayah.style.color = 'rgba(200,160,20,.7)';
  const style = document.getElementById('theme-scrollbar-style') || document.createElement('style');
  style.id = 'theme-scrollbar-style';
  style.textContent = `.sb-nav::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15)!important;}`;
  document.head.appendChild(style);
}

function _applyLightSidebar(theme) {
  const logoTitle = document.querySelector('.sb-logo-title, .sb-logo .t1');
  if (logoTitle) logoTitle.style.color = theme.vars['--primary-d'];
  const logoSub = document.querySelector('.sb-logo-sub, .sb-logo .t2');
  if (logoSub) logoSub.style.color = theme.vars['--accent'];
  document.querySelectorAll('.sb-logo, .sb-footer').forEach(el => { el.style.borderColor = theme.vars['--border']; });
  const sbUser = document.querySelector('.sb-user');
  if (sbUser) { sbUser.style.background = theme.vars['--primary-p']; sbUser.style.borderColor = 'rgba(0,0,0,.08)'; }
  document.querySelectorAll('.sb-uname').forEach(el => el.style.color = theme.vars['--primary-d']);
  document.querySelectorAll('.sb-urole').forEach(el => {
    el.style.color = theme.vars['--primary']; el.style.background = 'none'; el.style.boxShadow = 'none';
    el.style.textShadow = 'none'; el.style.padding = '0'; el.style.border = 'none'; el.style.borderRadius = '0';
  });
  document.querySelectorAll('.sb-item').forEach(el => { if (!el.classList.contains('active')) el.style.color = theme.vars['--sb-text']; });
  document.querySelectorAll('.sb-section, .sb-sec').forEach(el => { el.style.color = '#9ca3af'; });
  const ayah = document.querySelector('.sb-ayah, .sb-footer-ayah');
  if (ayah) ayah.style.color = theme.vars['--accent'];
  const style = document.getElementById('theme-scrollbar-style') || document.createElement('style');
  style.id = 'theme-scrollbar-style';
  style.textContent = `.sb-nav::-webkit-scrollbar-thumb{background:${theme.vars['--border']}!important;}`;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────
//  loadUserTheme — الكاش فوراً، وبعدين الثيم المحفوظ في القاعدة (بالـ auth_id)
// ─────────────────────────────────────────────
async function _themeSession(){
  for (let i = 0; i < 20 && !window.db; i++) await new Promise(r => setTimeout(r, 150));
  if (!window.db) return null;
  try { const { data } = await window.db.auth.getSession(); return (data && data.session) ? data.session.user.id : null; }
  catch (e) { return null; }
}
async function loadUserTheme() {
  applyTheme(_themeCurrent());
  const uid = await _themeSession(); if (!uid) return;
  _THEME_UID = uid;
  const cached = _themeLS(_themeKey());
  if (cached && THEMES[cached]) applyTheme(cached);
  try {
    const { data, error } = await window.db.from('users').select('theme').eq('auth_id', uid).maybeSingle();
    if (error) throw error;
    if (data && data.theme && THEMES[data.theme]) applyTheme(data.theme);
  } catch (e) { console.warn('[theme] load', e); }
}

// ─────────────────────────────────────────────
//  saveUserTheme — يطبّق فوراً + يحفظ في القاعدة ويتأكد
// ─────────────────────────────────────────────
async function saveUserTheme(themeKey) {
  if (!THEMES[themeKey]) return false;
  applyTheme(themeKey);
  if (!window.db) return false;
  try {
    if (!_THEME_UID) _THEME_UID = (await _themeSession()) || '';
    const { data, error } = await window.db.rpc('set_my_theme', { p_theme: themeKey });
    if (error || !data || !data.ok) throw (error || new Error('لم يُحفظ'));
    _themeLS(_themeKey(), themeKey);
    if (typeof showToast === 'function') showToast('🎨 الثيم اتحفظ لحسابك');
    return true;
  } catch (e) {
    console.warn('[theme] save', e);
    if (typeof showToast === 'function') showToast('⚠️ الثيم اتطبّق بس ما اتحفظش في الحساب — تأكد من الاتصال');
    return false;
  }
}

// ─────────────────────────────────────────────
//  openThemePicker — Modal اختيار الثيم
// ─────────────────────────────────────────────
function openThemePicker() {
  closeThemePicker();
  const current = _themeCurrent();
  const modal = document.createElement('div');
  modal.id = 'theme-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);font-family:\'Tajawal\',sans-serif;';
  const themeCards = Object.entries(THEMES).map(([key, t]) => `
    <div onclick="pickTheme('${key}')" data-theme="${key}" style="
      cursor:pointer;border-radius:12px;padding:14px 12px;
      border:2.5px solid ${key === current ? 'var(--gold,#c8920a)' : '#e5e7eb'};
      background:${key === current ? 'rgba(200,146,10,.06)' : '#fff'};
      display:flex;flex-direction:column;align-items:center;gap:8px;transition:all .18s;text-align:center;"
      onmouseover="this.style.borderColor='var(--gold,#c8920a)';this.style.transform='translateY(-2px)'"
      onmouseout="this.style.borderColor='${key===current?'var(--gold,#c8920a)':'#e5e7eb'}';this.style.transform=''">
      <div style="font-size:1.8rem">${t.emoji}</div>
      <div style="font-size:.78rem;font-weight:700;color:#1a1a1a;">${t.label}</div>
      <div style="display:flex;gap:4px;margin-top:2px;">
        <div style="width:18px;height:18px;border-radius:50%;background:${t.vars['--primary-d']};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2)"></div>
        <div style="width:18px;height:18px;border-radius:50%;background:${t.vars['--primary']};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2)"></div>
        <div style="width:18px;height:18px;border-radius:50%;background:${t.vars['--accent']};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2)"></div>
      </div>
      ${key===current ? '<div style="font-size:.65rem;color:#c8920a;font-weight:700;">✓ الحالي</div>' : ''}
    </div>`).join('');
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:28px;width:92%;max-width:560px;max-height:88vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.35);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div>
          <div style="font-size:1.1rem;font-weight:800;color:#1a1a1a;">🎨 اختر ثيمك الشخصي</div>
          <div style="font-size:.76rem;color:#6b7280;margin-top:3px;">يُحفظ تلقائياً لحسابك على أي جهاز</div>
        </div>
        <div onclick="closeThemePicker()" style="width:34px;height:34px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:1.1rem;color:#6b7280;">✕</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;">${themeCards}</div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeThemePicker(); });
}
function pickTheme(key) { closeThemePicker(); saveUserTheme(key); }
function openThemePicker_refresh() {}
function closeThemePicker() { const m = document.getElementById('theme-modal'); if (m) m.remove(); }

// ─────────────────────────────────────────────
//  patchThemeOnNav — يضمن التطبيق بعد navPage
// ─────────────────────────────────────────────
function patchThemeOnNav() {
  const key = _themeCurrent();
  const theme = THEMES[key] || THEMES['forest'];
  document.querySelectorAll('.sb-item').forEach(el => {
    if (el.classList.contains('active')) {
      el.style.background  = theme.vars['--sb-active'];
      el.style.borderColor = theme.vars['--sb-active-b'];
      el.style.color       = '#ffffff';
    } else {
      el.style.background  = '';
      el.style.borderColor = 'transparent';
      el.style.color       = theme.dark ? 'rgba(255,255,255,.58)' : theme.vars['--sb-text'];
    }
  });
}
