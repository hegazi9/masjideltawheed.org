/* ═══════════════════════════════════════════════════════════════════════
   pwa.js — تطبيق الموبايل (PWA) + الإشعارات (Push) | مدرسة التوحيد القرآنية — دفعة ٣٥
   • <script src="pwa.js" data-page="login"> في صفحة الدخول: التثبيت بس
   • <script src="pwa.js"> آخر لوحة المدير: التثبيت + الإشعارات + كارت الإعدادات
   • بيسجّل sw.js • شريط تحت على الموبايل («ثبّت التطبيق» ← «فعّل الإشعارات»)
   • شرح التثبيت للآيفون (Safari ← مشاركة ← إضافة إلى الشاشة الرئيسية) وللأندرويد
   • الجهاز بيتسجّل في القاعدة (push_subscribe) — والإرسال من السيرفر (Edge Function send-push)
   • لأي لوحة تانية بعدين: ضيف السكربت + الكارت (#pwa-card-body) + الدور في PUSH_ROLES ودوال push_*
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
if (window.PWA) return;

var PAGE = (document.currentScript && document.currentScript.getAttribute('data-page')) || 'dash';
var PUSH_ROLES = ['admin'];
var LS_HIDE = 'pwa_bar_hide_v1';
var S = { reg: null, sub: null, key: null, deferred: null, busy: false, role: '', err: '', ready: false };
var UA = navigator.userAgent || '';

/* ══════════ الجهاز ══════════ */
function isIOS() { return /iphone|ipad|ipod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isAndroid() { return /android/i.test(UA); }
function isMobile() { return isIOS() || isAndroid() || /mobile/i.test(UA); }
function iosVer() { var m = UA.match(/OS (\d+)[_.](\d+)/); return m ? (+m[1] + (+m[2]) / 100) : 0; }   // 16.4 → 16.04
function iosOld() { var v = iosVer(); return isIOS() && v > 0 && v < 16.04; }
function iosNotSafari() { return isIOS() && /CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\//i.test(UA); }
function standalone() {
  try {
    return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches
      || matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;
  } catch (e) { return false; }
}
function supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function perm() { return ('Notification' in window) ? Notification.permission : 'unsupported'; }

/* ══════════ أدوات ══════════ */
function toast(m) { if (typeof showToast === 'function') showToast(m); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function timeout(p, ms) { return Promise.race([p, sleep(ms).then(function () { throw new Error('timeout'); })]); }
function safe(t) { return String(t == null ? '' : t).replace(/[<>&"']/g, ''); }
function myRole() { try { return (JSON.parse(localStorage.getItem('currentUser') || '{}').role) || ''; } catch (e) { return ''; } }
function pushRole() { return PAGE === 'dash' && PUSH_ROLES.indexOf(S.role) > -1; }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* وضع خاص */ } }
function b64u(buf) {
  var b = new Uint8Array(buf), s = '';
  for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str) {
  var s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  var r = atob(s), b = new Uint8Array(r.length);
  for (var i = 0; i < r.length; i++) b[i] = r.charCodeAt(i);
  return b;
}
function errMsg(e) {
  var m = String((e && (e.message || e.msg)) || e || '');
  if (/fetch|network|Failed to/i.test(m)) return 'الشبكة مقطوعة — جرّب تاني';
  if (/غير مسموح|not allowed|permission/i.test(m)) return 'الموبايل أو الحساب مش سامح بالإشعارات';
  if (/timeout/i.test(m)) return 'الموبايل ما ردّش — اقفل التطبيق وافتحه تاني وجرّب';
  if (/[؀-ۿ]/.test(m)) return m;
  return 'حصلت مشكلة — اقفل التطبيق وافتحه تاني وجرّب';
}
async function rpc(name, args) {
  var r = await db.rpc(name, args || {});
  if (r.error) throw r.error;
  return r.data;
}

/* ══════════ الـ head (لو الصفحة مافيهاش الوسوم) ══════════ */
function head() {
  function add(tag, attrs, sel) {
    if (document.querySelector(sel)) return;
    var el = document.createElement(tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    document.head.appendChild(el);
  }
  add('link', { rel: 'manifest', href: 'manifest.webmanifest' }, 'link[rel="manifest"]');
  add('meta', { name: 'theme-color', content: '#0f2318' }, 'meta[name="theme-color"]');
  add('link', { rel: 'apple-touch-icon', href: 'pwa-apple.png' }, 'link[rel="apple-touch-icon"]');
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' }, 'meta[name="mobile-web-app-capable"]');
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }, 'meta[name="apple-mobile-web-app-capable"]');
  add('meta', { name: 'apple-mobile-web-app-title', content: 'مدرسة التوحيد' }, 'meta[name="apple-mobile-web-app-title"]');
}

/* ══════════ CSS (الشريط + شرح التثبيت) ══════════ */
var CSS = ''
+ '.pwa-bar{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:990;display:none;align-items:center;gap:10px;'
+   'background:#0f2318;color:#fff;border-radius:16px;padding:10px 10px 10px 12px;box-shadow:0 10px 32px rgba(0,0,0,.35);font-family:Tajawal,sans-serif;direction:rtl;animation:pwaUp .3s ease both;}'
+ '.pwa-bar.on{display:flex;}'
+ '@keyframes pwaUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}'
+ '.pwa-bar img{width:40px;height:40px;border-radius:50%;flex:0 0 40px;}'
+ '.pwa-bar .t{flex:1;min-width:0;font-size:.86rem;font-weight:800;line-height:1.45;}'
+ '.pwa-bar .t small{display:block;font-size:.72rem;font-weight:600;color:rgba(255,255,255,.7);}'
+ '.pwa-bar .go{border:none;background:#f0b429;color:#0f2318;font-family:inherit;font-size:.86rem;font-weight:900;border-radius:11px;padding:10px 14px;cursor:pointer;white-space:nowrap;}'
+ '.pwa-bar .go:disabled{opacity:.6;}'
+ '.pwa-bar .x{border:none;background:rgba(255,255,255,.12);color:#fff;width:30px;height:30px;border-radius:50%;font-size:1rem;cursor:pointer;flex:0 0 30px;line-height:1;padding:0;}'
+ 'body.pwa-bar-on{padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))!important;}'
+ 'body.pwa-bar-on .toast{bottom:calc(86px + env(safe-area-inset-bottom,0px))!important;}'
+ 'body.pwa-bar-on .fbn-pops{bottom:calc(86px + env(safe-area-inset-bottom,0px))!important;}'
+ '.pwa-ov{position:fixed;inset:0;z-index:13500;background:rgba(10,20,14,.55);backdrop-filter:blur(2px);display:none;align-items:flex-end;justify-content:center;font-family:Tajawal,sans-serif;direction:rtl;}'
+ '.pwa-ov.open{display:flex;}'
+ '.pwa-sh{background:#fff;color:#0f2318;width:100%;max-width:520px;border-radius:22px 22px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));max-height:88vh;overflow-y:auto;animation:pwaUp .25s ease both;}'
+ '.pwa-sh h3{margin:0 0 4px;font-size:1.15rem;font-weight:900;display:flex;align-items:center;gap:10px;}'
+ '.pwa-sh h3 img{width:38px;height:38px;border-radius:50%;}'
+ '.pwa-sh .sub{font-size:.8rem;color:#4a5e52;margin:0 0 12px;}'
+ '.pwa-st{display:flex;gap:12px;align-items:flex-start;padding:11px 0;border-bottom:1px dashed #dce8e0;}'
+ '.pwa-st:last-of-type{border-bottom:none;}'
+ '.pwa-st .n{width:28px;height:28px;border-radius:50%;background:#1e5c36;color:#fff;font-weight:900;font-size:.85rem;display:flex;align-items:center;justify-content:center;flex:0 0 28px;}'
+ '.pwa-st .d{flex:1;font-size:.9rem;font-weight:700;line-height:1.75;}'
+ '.pwa-st .d small{display:block;font-size:.76rem;font-weight:600;color:#8ea598;}'
+ '.pwa-ic{display:inline-flex;vertical-align:middle;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;background:#e8f2fb;color:#1d6fa4;margin:0 3px;}'
+ '.pwa-ic svg{width:17px;height:17px;}'
+ '.pwa-warn{background:#fdf0ef;color:#c0392b;border-radius:11px;padding:10px 12px;font-size:.82rem;font-weight:800;margin:6px 0 10px;line-height:1.7;}'
+ '.pwa-note{background:#e8f5ee;color:#1e5c36;border-radius:11px;padding:10px 12px;font-size:.8rem;font-weight:700;margin-top:10px;line-height:1.7;}'
+ '.pwa-cl{width:100%;margin-top:14px;border:none;background:#1e5c36;color:#fff;font-family:inherit;font-size:.95rem;font-weight:800;border-radius:12px;padding:12px;cursor:pointer;}'
+ '';

function injectCSS() {
  if (document.getElementById('pwa-css')) return;
  var s = document.createElement('style'); s.id = 'pwa-css'; s.textContent = CSS;
  document.head.appendChild(s);
}
var IC_SHARE = '<span class="pwa-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></span>';
var IC_ADD = '<span class="pwa-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg></span>';
var IC_DOTS = '<span class="pwa-ic"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></span>';

/* ══════════ شرح التثبيت ══════════ */
var $ov, $bar;
function guideHTML() {
  var st = function (n, d, s) { return '<div class="pwa-st"><div class="n">' + n + '</div><div class="d">' + d + (s ? '<small>' + s + '</small>' : '') + '</div></div>'; };
  var h = '<h3><img src="pwa-192.png" alt="">ثبّت تطبيق مدرسة التوحيد</h3>';
  if (isIOS()) {
    h += '<p class="sub">على الآيفون — دقيقة واحدة بس</p>';
    if (iosOld()) h += '<div class="pwa-warn">⚠️ نسخة الآيفون عندك قديمة — الإشعارات محتاجة iOS 16.4 أو أحدث (الإعدادات ← عام ← تحديث البرنامج). التطبيق نفسه هيشتغل عادي.</div>';
    if (iosNotSafari()) h += '<div class="pwa-warn">⚠️ إنت فاتح من برنامج تاني — انسخ الرابط وافتحه في <b>Safari</b> الأول.</div>';
    h += st(1, 'اضغط زرار المشاركة ' + IC_SHARE, 'تحت في الشاشة — لو مش ظاهر: اضغط «⋯» تحت وبعدين «مشاركة»')
      + st(2, 'انزل واختار «إضافة إلى الشاشة الرئيسية» ' + IC_ADD, 'لو مش ظاهرة: انزل لآخر القايمة ← «تعديل الإجراءات»')
      + st(3, 'اضغط «إضافة» فوق', 'لو ظهر اختيار «فتح كتطبيق ويب» خلّيه شغّال • هتلاقي أيقونة «مدرسة التوحيد» على الشاشة الرئيسية')
      + st(4, 'افتح التطبيق من الأيقونة وسجّل دخول', 'أول مرة بس — التطبيق ليه دخول لوحده غير Safari')
      + st(5, 'اضغط «🔔 فعّل الإشعارات» ← «سماح»', 'الإشعارات على الآيفون بتشتغل من جوه التطبيق بس');
  } else {
    h += '<p class="sub">على الأندرويد — من Chrome</p>'
      + st(1, 'اضغط ' + IC_DOTS + ' اللي فوق في Chrome', 'قايمة المتصفح')
      + st(2, 'اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»')
      + st(3, 'اضغط «تثبيت»', 'هتلاقي أيقونة «مدرسة التوحيد» على الشاشة الرئيسية')
      + st(4, 'افتح التطبيق من الأيقونة واضغط «🔔 فعّل الإشعارات» ← «سماح»');
  }
  h += '<div class="pwa-note">✅ بعد كده افتح من الأيقونة على طول — بيفتح زي أي تطبيق، والإشعارات بتوصل حتى لو التطبيق مقفول.</div>'
    + '<button class="pwa-cl" type="button" data-pwa-close="1">تمام</button>';
  return h;
}
function openGuide() {
  if (!$ov) {
    $ov = document.createElement('div'); $ov.className = 'pwa-ov';
    $ov.addEventListener('click', function (e) { if (e.target === $ov || e.target.closest('[data-pwa-close]')) closeGuide(); });
    document.body.appendChild($ov);
  }
  $ov.innerHTML = '<div class="pwa-sh">' + guideHTML() + '</div>';
  $ov.classList.add('open');
}
function closeGuide() { if ($ov) $ov.classList.remove('open'); }

/* ══════════ الاشتراك ══════════ */
function sameKey(sub, key) {
  try { var k = sub.options && sub.options.applicationServerKey; return !k || b64u(k) === key; } catch (e) { return true; }
}
async function getKey() {
  if (S.key) return S.key;
  S.key = await rpc('push_vapid_key');
  if (!S.key) throw new Error('الإشعارات لسه مش متجهّزة على السيرفر');
  return S.key;
}
// بيربط الموبايل ده بالحساب الحالي (من غير ما يسأل لو الإذن موجود)
async function syncSub() {
  if (!S.reg) throw new Error('التطبيق لسه بيتحمّل — اقفله وافتحه تاني');
  var key = await getKey();
  var sub = await S.reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) { try { await sub.unsubscribe(); } catch (e) { /* هنعمل واحد جديد */ } sub = null; }
  if (!sub) sub = await timeout(S.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(key) }), 20000);
  var j = sub.toJSON();
  await rpc('push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: String(UA).slice(0, 300) });
  S.sub = sub; S.err = '';
  lsSet('notif_desk_v1', '0');   // إشعارات المتصفح القديمة (من جوه الصفحة) — الـ Push بيغطّيها
}

async function enable() {
  if (S.busy) return;
  if (isIOS() && !standalone()) { openGuide(); return; }
  if (!supported()) { toast(isIOS() ? '📱 حدّث الآيفون لـ iOS 16.4 أو أحدث' : '⚠️ المتصفح ده مش بيدعم الإشعارات — استخدم Chrome'); return; }
  if (perm() === 'denied') { toast('🚫 الإشعارات مقفولة — افتحها من إعدادات الموبايل (الشرح في الإعدادات)'); render(); return; }
  S.busy = true; render();
  try {
    var p = await Notification.requestPermission();
    if (p !== 'granted') { toast('⚠️ لازم تختار «سماح» عشان الإشعارات توصل'); return; }
    await syncSub();
    toast('✅ الإشعارات اتفعّلت على الموبايل ده');
  } catch (e) {
    S.err = errMsg(e); toast('❌ ' + S.err);
  } finally { S.busy = false; render(); }
}

async function disable() {
  if (S.busy) return;
  S.busy = true; render();
  try {
    var sub = S.sub || (S.reg ? await S.reg.pushManager.getSubscription() : null);
    if (sub) {
      try { await rpc('push_unsubscribe', { p_endpoint: sub.endpoint }); } catch (e) { /* السيرفر هيمسحه لوحده أول ما يفشل */ }
      try { await sub.unsubscribe(); } catch (e) { /* مش مشكلة */ }
    }
    S.sub = null;
    toast('⏸️ الإشعارات اتوقفت على الجهاز ده');
  } finally { S.busy = false; render(); }
}

async function test() {
  if (S.busy) return;
  S.busy = true; render();
  try {
    if (S.sub) await syncSub();
    await rpc('push_test');
    toast('📨 اتبعت — هيظهر خلال ثواني');
  } catch (e) { toast('❌ ' + errMsg(e)); }
  finally { S.busy = false; render(); }
}

async function install() {
  if (standalone()) return;
  if (!S.deferred) { openGuide(); return; }
  try {
    S.deferred.prompt();
    var c = await S.deferred.userChoice;
    if (c && c.outcome === 'accepted') toast('✅ جاري التثبيت — هتلاقي الأيقونة على الشاشة الرئيسية');
  } catch (e) { /* المتصفح قفل النافذة */ }
  S.deferred = null; render();
}

// قبل الخروج: الموبايل ده مايستقبلش إشعارات الحساب ده تاني
async function beforeLogout() {
  try {
    await timeout((async function () {
      var sub = S.sub || (S.reg ? await S.reg.pushManager.getSubscription() : null);
      if (!sub) return;
      try { await rpc('push_unsubscribe', { p_endpoint: sub.endpoint }); } catch (e) { /* الجلسة انتهت */ }
      try { await sub.unsubscribe(); } catch (e) { /* مش مشكلة */ }
      S.sub = null;
    })(), 2500);
  } catch (e) { /* الخروج أهم */ }
  try { if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (e) { /* مش مدعوم */ }
}
function hookLogout() {
  if (typeof window.secureLogout !== 'function' || window.secureLogout.__pwa) return;
  var orig = window.secureLogout;
  var wrapped = async function () { await beforeLogout(); return orig.apply(this, arguments); };
  wrapped.__pwa = true;
  window.secureLogout = wrapped;
}

/* ══════════ المطلوب دلوقتي ══════════ */
function pushNeeded() { return S.ready && pushRole() && supported() && !S.sub && perm() !== 'denied' && !(isIOS() && !standalone()); }
function need() {
  if (!isMobile()) return '';
  if (!standalone()) return 'install';
  return pushNeeded() ? 'push' : '';
}
function tb() { var n = need(); if (n === 'install') install(); else if (n === 'push') enable(); else goSettings(); }

/* ══════════ الشريط اللي تحت (موبايل بس) ══════════ */
function renderBar() {
  if (!$bar) {
    $bar = document.createElement('div'); $bar.className = 'pwa-bar'; $bar.setAttribute('role', 'region');
    $bar.addEventListener('click', function (e) {
      if (e.target.closest('.x')) { lsSet(LS_HIDE, need() + ':' + Date.now()); renderBar(); return; }
      if (e.target.closest('.go')) tb();
    });
    document.body.appendChild($bar);
  }
  var n = need(), hid = String(lsGet(LS_HIDE) || '').split(':');
  var days = n === 'install' ? 3 : 1;
  var hidden = hid[0] === n && (Date.now() - (+hid[1] || 0)) < days * 86400000;
  var show = !!n && !hidden;
  if (show) {
    var txt = n === 'install'
      ? 'ثبّت تطبيق مدرسة التوحيد<small>يفتح من أيقونة على الشاشة زي أي تطبيق</small>'
      : 'فعّل الإشعارات على الموبايل<small>الرسائل توصلك حتى والتطبيق مقفول</small>';
    var btn = n === 'install' ? (isIOS() || !S.deferred ? '📲 إزاي؟' : '📥 ثبّت') : (S.busy ? '⏳' : '🔔 فعّل');
    $bar.innerHTML = '<img src="pwa-192.png" alt=""><div class="t">' + txt + '</div>'
      + '<button class="go" type="button"' + (S.busy ? ' disabled' : '') + '>' + btn + '</button>'
      + '<button class="x" type="button" title="بعدين">×</button>';
  }
  $bar.classList.toggle('on', show);
  document.body.classList.toggle('pwa-bar-on', show);
}

/* ══════════ كارت الإعدادات ══════════ */
function goSettings() {
  try { if (typeof navPage === 'function') navPage('settings'); } catch (e) { /* مش مهم */ }
  setTimeout(function () {
    var c = document.getElementById('pwa-card');
    if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.style.boxShadow = '0 0 0 3px var(--gold-l,#f0b429)'; setTimeout(function () { c.style.boxShadow = ''; }, 1800); }
  }, 120);
}
function row(icon, label, val, extra) {
  return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px dashed var(--border,#dce8e0);">'
    + '<div style="font-size:1.25rem;line-height:1.4;">' + icon + '</div>'
    + '<div style="flex:1;min-width:0;"><div style="font-size:.8rem;color:var(--light,#8ea598);font-weight:700;">' + label + '</div>'
    + '<div style="font-size:.9rem;color:var(--forest,#0f2318);font-weight:800;margin-top:2px;line-height:1.7;">' + val + '</div>'
    + (extra ? '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">' + extra + '</div>' : '') + '</div></div>';
}
function btn(cls, act, txt) {
  return '<button class="btn ' + cls + ' btn-sm" ' + (S.busy ? 'disabled ' : '') + 'onclick="PWA.' + act + '()">' + txt + '</button>';
}
function deniedHelp() {
  if (isIOS()) return 'افتح «الإعدادات» في الآيفون ← الإشعارات ← مدرسة التوحيد ← «السماح بالإشعارات»';
  if (isAndroid()) return 'اضغط ضغطة طويلة على أيقونة التطبيق ← ⓘ معلومات التطبيق ← الإشعارات ← سماح';
  return 'اضغط 🔒 جنب العنوان ← الإشعارات ← «سماح»';
}
function render() {
  var t = document.getElementById('pwa-tb');
  if (t) {
    var n = need();
    t.style.display = n ? '' : 'none';
    t.title = n === 'install' ? 'ثبّت التطبيق على الموبايل' : 'فعّل الإشعارات';
  }
  if (document.body) renderBar();
  var box = document.getElementById('pwa-card-body');
  if (!box) return;
  var on = !!S.sub, p = perm(), sa = standalone(), mob = isMobile(), h = '';
  // ١) التطبيق
  if (sa) h += row('📲', 'التطبيق', '✅ إنت فاتح من التطبيق');
  else if (S.deferred) h += row('📲', 'التطبيق', 'مش متثبّت على الجهاز ده', btn('btn-primary', 'install', '📥 ثبّت التطبيق'));
  else if (mob) h += row('📲', 'التطبيق', 'مش متثبّت على الموبايل ده', btn('btn-primary', 'guide', isIOS() ? '📖 طريقة التثبيت على الآيفون' : '📖 طريقة التثبيت'));
  else h += row('📲', 'التطبيق', 'افتح الموقع من موبايلك وثبّته من هناك — هيظهر شريط تحت فيه «ثبّت»');
  // ٢) الإشعارات
  var L = 'إشعارات الجهاز ده';
  if (!S.ready) h += row('🔔', L, '⏳ جاري الفحص…');
  else if (!pushRole()) h += row('🔔', L, 'مش متاحة للحساب ده لسه');
  else if (isIOS() && !sa) h += row('🔔', L, (iosOld() ? '⚠️ محتاج تحدّث الآيفون لـ iOS 16.4 أو أحدث — و' : '') + 'على الآيفون الإشعارات بتشتغل من جوه التطبيق بس — ثبّته الأول وافتحه من الأيقونة', btn('btn-outline', 'guide', '📖 إزاي أثبّته؟'));
  else if (!supported()) h += row('🔔', L, isIOS() ? 'محتاج تحدّث الآيفون لـ iOS 16.4 أو أحدث' : 'المتصفح ده مش بيدعم الإشعارات — استخدم Chrome');
  else if (p === 'denied') h += row('🔔', L, '🚫 مقفولة من إعدادات الجهاز — ' + deniedHelp() + '، وبعدين ارجع هنا واضغط «فعّل»', btn('btn-primary', 'enable', '🔔 فعّل الإشعارات'));
  else if (on) h += row('🔔', L, '✅ مفعّلة — أي إشعار جديد هيظهر على الجهاز حتى لو التطبيق مقفول',
    btn('btn-outline', 'test', '📨 إشعار تجربة') + btn('btn-ghost', 'disable', '⏸️ إيقاف على الجهاز ده'));
  else h += row('🔔', L, S.err ? ('⚠️ ' + safe(S.err)) : 'مش مفعّلة', btn('btn-primary', 'enable', S.busy ? '⏳ لحظة…' : '🔔 فعّل الإشعارات'));
  h += '<div style="font-size:.76rem;color:var(--light,#8ea598);line-height:1.8;padding-top:10px;">'
    + 'كل جهاز بيتفعّل لوحده • الخروج من الحساب بيوقف الإشعارات على الجهاز ده'
    + (isAndroid() ? ' • لو الإشعارات بتتأخر: إعدادات البطارية ← Chrome ← «غير مقيّد»' : '') + '</div>';
  box.innerHTML = h;
}

/* ══════════ فتح الإشعار اللي اتضغط ══════════ */
// نوع الإشعار ← الصفحة (نفس notifications.js) — لو الإشعار مالوش link
var NTF_PAGE = {
  message: 'messages', message_urgent: 'messages', announcement: 'announcements',
  lesson_prep: 'rep-lessons', lesson_prep_ok: 'lessonprep', lesson_prep_back: 'lessonprep',
  course_summary: 'rep-summaries', alert_action: 'walerts', points: 'points', session: 'reports', tasks: 'tasks'
};
async function openNtf(id) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(String(id))) return;
  try { window.focus(); } catch (e) { /* مش مهم */ }
  // استنى اللوحة تخلّص إقلاعها (التاريخ في الشريط العلوي بيتكتب بعد التحقق من الحساب)
  for (var i = 0; i < 80; i++) {
    var d = document.getElementById('tb-date');
    if (typeof window.db !== 'undefined' && window.NotifSys && (!d || d.textContent.trim())) break;
    await sleep(250);
  }
  try {
    var r = await db.from('notifications').select('id,type,link,is_read').eq('id', id).maybeSingle();
    if (r.error || !r.data) { if (window.NotifSys) window.NotifSys.open(); return; }
    if (!r.data.is_read && window.NotifSys) window.NotifSys.markRead([r.data.id]);
    var page = r.data.link || NTF_PAGE[r.data.type] || '';
    if (page && document.getElementById('page-' + page) && typeof navPage === 'function') navPage(page);
    else if (window.NotifSys) window.NotifSys.open();
  } catch (e) { /* مش مهم — الإشعار في الجرس */ }
}
function ntfFromUrl() {
  try {
    var u = new URL(location.href), id = u.searchParams.get('ntf');
    if (!id) return;
    u.searchParams.delete('ntf');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    setTimeout(function () { openNtf(id); }, 600);
  } catch (e) { /* مش مهم */ }
}

/* ══════════ رقم غير المقروء على أيقونة التطبيق ══════════ */
function badgeTick() {
  if (!navigator.setAppBadge || !window.NotifSys || typeof window.NotifSys.unread !== 'function') return;
  try { var n = window.NotifSys.unread(); if (n > 0) navigator.setAppBadge(n); else navigator.clearAppBadge(); } catch (e) { /* مش مدعوم */ }
}

/* ══════════ جوه التطبيق: زرار تحديث (مفيش شريط متصفح) ══════════ */
function reloadBtn() {
  if (!standalone() || document.getElementById('pwa-reload')) return;
  var lo = document.querySelector('.sb-footer .sb-logout');
  if (!lo) return;
  var b = document.createElement('div');
  b.id = 'pwa-reload'; b.className = 'sb-logout'; b.title = 'تحديث'; b.textContent = '🔄';
  b.style.cssText = 'background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.15);color:#fff;';
  b.addEventListener('click', function () { location.reload(); });
  lo.parentNode.insertBefore(b, lo);
}

/* ══════════ الإقلاع ══════════ */
async function boot() {
  head();
  injectCSS();
  if (PAGE === 'dash') hookLogout();
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.deferred = e; render(); });
  window.addEventListener('appinstalled', function () {
    S.deferred = null; render();
    toast('✅ التطبيق اتثبّت — افتحه من الأيقونة على الشاشة الرئيسية');
  });
  render();
  reloadBtn();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'pwa-open') openNtf(e.data.id);
    });
    try {
      await navigator.serviceWorker.register('sw.js');
      S.reg = await timeout(navigator.serviceWorker.ready, 15000);
    } catch (e) { S.err = 'التطبيق ما اتسجّلش — اقفله وافتحه تاني'; }
  }
  if (PAGE !== 'dash') { S.ready = true; render(); return; }
  for (var i = 0; i < 40 && typeof window.db === 'undefined'; i++) await sleep(250);
  S.role = myRole();
  try {
    var ses = (typeof window.db !== 'undefined') ? (await db.auth.getSession()).data.session : null;
    if (ses && S.reg && pushRole() && supported() && perm() === 'granted') {
      try { await syncSub(); } catch (e) { S.err = errMsg(e); }
    }
  } catch (e) { /* هيتعرض في الكارت */ }
  S.ready = true;
  render();
  ntfFromUrl();
  badgeTick();
  setInterval(badgeTick, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { badgeTick(); render(); } });
  window.addEventListener('focus', badgeTick);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

window.PWA = { enable: enable, disable: disable, test: test, install: install, guide: openGuide, tb: tb,
  goSettings: goSettings, beforeLogout: beforeLogout, render: render };
})();
