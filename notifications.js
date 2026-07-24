/* ═══════════════════════════════════════════════════════════════════════
   notifications.js — نظام الإشعارات (طراز فيسبوك)
   مدرسة التوحيد القرآنية | يعمل في لوحات: المعلم • المشرف • المدير
   يتطلب: window.db (Supabase) — showToast() — navPage() أو nav()
   المصدر الوحيد للبيانات: جدول public.notifications (Realtime)
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
if (window.NotifSys) return;

/* ══════════ إعدادات ══════════ */
var PAGE_SIZE = 20;
var POLL_MS   = 60000;
var LS_SOUND  = 'notif_sound_v1';
var LS_DESK   = 'notif_desk_v1';

var MY = { id: '', name: '', role: '' };
var ITEMS = [], UNREAD = 0, FILTER = 'all';
var HAS_MORE = true, LOADING = false, OPEN = false, BOOTED = false;
var RT = null, POLL = null, MENU_ID = null;

/* ══════════ أدوات ══════════ */
function ar(n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtTime(iso) {
  if (!iso) return '';
  var d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
  if (s < 45) return 'الآن';
  if (s < 3600) return 'منذ ' + ar(Math.floor(s / 60)) + ' د';
  if (s < 86400) return 'منذ ' + ar(Math.floor(s / 3600)) + ' س';
  if (s < 172800) return 'أمس';
  if (s < 604800) return 'منذ ' + ar(Math.floor(s / 86400)) + ' أيام';
  try { return ar(d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })); }
  catch (e) { return ''; }
}
function dayGroup(iso) {
  var d = new Date(iso), n = new Date();
  var a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  var diff = Math.round((b - a) / 86400000);
  if (diff <= 0) return 'اليوم';
  if (diff === 1) return 'أمس';
  if (diff <= 7) return 'هذا الأسبوع';
  if (diff <= 30) return 'هذا الشهر';
  return 'أقدم';
}
function hue(str) {
  var h = 0, i;
  for (i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) % 360;
  return h;
}
function avColor(name) { return 'hsl(' + hue(name || '؟') + ',42%,42%)'; }
function initial(name) {
  var t = String(name || '؟').trim().replace(/^(الشيخ|الأستاذ|الأستاذة|د\.|أ\.|م\.)\s*/, '');
  return t.charAt(0) || '؟';
}

/* ══════════ أنواع الإشعارات ══════════ */
function ic(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; }
var TYPES = {
  message:          { c: '#1d6fa4', l: 'رسالة',          p: 'messages',    i: ic('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>') },
  message_urgent:   { c: '#c0392b', l: 'رسالة عاجلة',    p: 'messages',    i: ic('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>') },
  announcement:     { c: '#c8920a', l: 'إعلان',          p: 'announcements', i: ic('<path d="m3 11 18-6v14L3 13z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>') },
  lesson_prep:      { c: '#6b3fa0', l: 'تحضير درس',      p: 'rep-lessons', i: ic('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>') },
  lesson_prep_ok:   { c: '#1e5c36', l: 'اعتماد تحضير',   p: 'lessonprep',  i: ic('<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m9 11 3 3L22 4"/>') },
  lesson_prep_back: { c: '#c8920a', l: 'إرجاع تحضير',    p: 'lessonprep',  i: ic('<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>') },
  alert_action:     { c: '#c0392b', l: 'تنبيه أسبوعي',   p: 'walerts',     i: ic('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>') },
  points:           { c: '#c8920a', l: 'نقاط',           p: 'points',      i: ic('<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>') },
  session:          { c: '#6b3fa0', l: 'زيارة إشرافية',  p: 'reports',     i: ic('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>') },
  tasks:            { c: '#1e5c36', l: 'المهام اليومية', p: 'tasks',       i: ic('<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>') },
  system:           { c: '#4a5e52', l: 'النظام',         p: '',            i: ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>') }
};
function T(t) { return TYPES[t] || TYPES.system; }

/* ══════════ CSS ══════════ */
var CSS = ''
+ '.fbn-wrap{position:relative;}'
+ '.fbn-bell{position:relative;width:38px;height:38px;border-radius:var(--r-sm,9px);background:var(--bg,#f5f7f5);border:1.5px solid var(--border,#dce8e0);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--forest,#0f2318);transition:all .2s;}'
+ '.fbn-bell:hover{border-color:var(--jade,#2d7a50);}'
+ '.fbn-bell.act{background:var(--jade,#2d7a50);border-color:var(--jade,#2d7a50);color:#fff;}'
+ '.fbn-bell.ring{animation:fbnRing .82s ease;}'
+ '@keyframes fbnRing{0%,100%{transform:rotate(0)}12%{transform:rotate(15deg)}25%{transform:rotate(-13deg)}38%{transform:rotate(10deg)}52%{transform:rotate(-8deg)}66%{transform:rotate(5deg)}80%{transform:rotate(-3deg)}}'
+ '.fbn-cnt{position:absolute;top:-3px;left:-3px;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:#e0245e;border:2px solid #fff;color:#fff;font-size:.66rem;font-weight:800;display:none;align-items:center;justify-content:center;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,.2);}'
+ '.fbn-cnt.on{display:flex;}'
+ '.fbn-dd{position:absolute;top:calc(100% + 12px);left:0;width:392px;max-width:calc(100vw - 24px);background:#fff;border-radius:16px;border:1px solid var(--border,#dce8e0);box-shadow:0 12px 42px rgba(15,35,24,.20);z-index:12000;display:none;flex-direction:column;overflow:hidden;transform-origin:top left;}'
+ '.fbn-dd.open{display:flex;animation:fbnIn .16s ease both;}'
+ '@keyframes fbnIn{from{opacity:0;transform:translateY(-8px) scale(.97)}to{opacity:1;transform:none}}'
+ '.fbn-hd{padding:14px 16px 8px;display:flex;align-items:center;justify-content:space-between;gap:8px;}'
+ '.fbn-hd h4{margin:0;font-size:1.22rem;font-weight:900;color:var(--forest,#0f2318);letter-spacing:-.2px;}'
+ '.fbn-hbtn{width:32px;height:32px;border-radius:50%;border:none;background:var(--pale,#e8f5ee);color:var(--mid,#4a5e52);cursor:pointer;font-size:1rem;font-weight:900;display:flex;align-items:center;justify-content:center;line-height:1;}'
+ '.fbn-hbtn:hover{background:var(--border,#dce8e0);}'
+ '.fbn-pills{display:flex;gap:8px;padding:2px 16px 12px;}'
+ '.fbn-pill{border:none;background:var(--pale,#e8f5ee);color:var(--mid,#4a5e52);font-family:inherit;font-size:.8rem;font-weight:700;padding:6px 15px;border-radius:99px;cursor:pointer;transition:.14s;}'
+ '.fbn-pill:hover{background:var(--border,#dce8e0);}'
+ '.fbn-pill.on{background:var(--pale,#e8f5ee);color:var(--emerald,#1e5c36);box-shadow:inset 0 0 0 1.5px var(--jade,#2d7a50);}'
+ '.fbn-list{max-height:430px;overflow-y:auto;padding:0 6px 6px;scrollbar-width:thin;}'
+ '.fbn-list::-webkit-scrollbar{width:6px;}'
+ '.fbn-list::-webkit-scrollbar-thumb{background:var(--border,#dce8e0);border-radius:99px;}'
+ '.fbn-grp{font-size:.78rem;font-weight:800;color:var(--forest,#0f2318);padding:10px 10px 6px;}'
+ '.fbn-it{position:relative;display:flex;gap:11px;align-items:flex-start;padding:9px 34px 9px 10px;border-radius:11px;cursor:pointer;transition:background .13s;}'
+ '.fbn-it:hover{background:#f2f6f3;}'
+ '.fbn-it.un{background:rgba(45,122,80,.055);}'
+ '.fbn-it.un:hover{background:rgba(45,122,80,.10);}'
+ '.fbn-av{position:relative;width:48px;height:48px;border-radius:50%;flex:0 0 48px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.15rem;font-weight:800;font-family:inherit;}'
+ '.fbn-avb{position:absolute;bottom:-2px;left:-3px;width:22px;height:22px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;}'
+ '.fbn-avb svg{width:12px;height:12px;}'
+ '.fbn-tx{flex:1;min-width:0;padding-top:1px;}'
+ '.fbn-t1{font-size:.845rem;line-height:1.5;color:#1a1a1a;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}'
+ '.fbn-t1 b{font-weight:800;color:var(--forest,#0f2318);}'
+ '.fbn-t2{font-size:.775rem;line-height:1.45;color:var(--mid,#4a5e52);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}'
+ '.fbn-t3{font-size:.72rem;font-weight:700;color:var(--light,#8ea598);margin-top:4px;}'
+ '.fbn-it.un .fbn-t3{color:var(--jade,#2d7a50);}'
+ '.fbn-dot{position:absolute;left:11px;top:50%;transform:translateY(-50%);width:11px;height:11px;border-radius:50%;background:var(--jade,#2d7a50);}'
+ '.fbn-mb{position:absolute;left:8px;top:8px;width:26px;height:26px;border-radius:50%;border:1px solid var(--border,#dce8e0);background:#fff;color:var(--mid,#4a5e52);cursor:pointer;display:none;align-items:center;justify-content:center;font-size:.95rem;font-weight:900;line-height:1;padding:0;}'
+ '.fbn-it:hover .fbn-mb{display:flex;}'
+ '.fbn-it:hover .fbn-dot{display:none;}'
+ '.fbn-menu{position:fixed;z-index:12100;background:#fff;border:1px solid var(--border,#dce8e0);border-radius:12px;box-shadow:0 10px 32px rgba(15,35,24,.18);padding:6px;min-width:196px;display:none;}'
+ '.fbn-menu.open{display:block;}'
+ '.fbn-mi{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:8px;font-size:.82rem;font-weight:700;color:var(--forest,#0f2318);cursor:pointer;white-space:nowrap;}'
+ '.fbn-mi:hover{background:var(--pale,#e8f5ee);}'
+ '.fbn-mi.dg{color:var(--red,#c0392b);}'
+ '.fbn-mi.dg:hover{background:var(--red-pale,#fdf0ef);}'
+ '.fbn-mi small{margin-right:auto;font-size:.7rem;font-weight:800;color:var(--light,#8ea598);}'
+ '.fbn-ft{border-top:1px solid var(--border,#dce8e0);padding:11px;text-align:center;font-size:.83rem;font-weight:800;color:var(--jade,#2d7a50);cursor:pointer;}'
+ '.fbn-ft:hover{background:var(--pale,#e8f5ee);}'
+ '.fbn-empty{padding:38px 20px;text-align:center;color:var(--light,#8ea598);}'
+ '.fbn-empty svg{width:46px;height:46px;stroke:var(--border,#dce8e0);stroke-width:1.6;fill:none;margin-bottom:10px;}'
+ '.fbn-empty div{font-size:.85rem;font-weight:700;}'
+ '.fbn-sk{display:flex;gap:11px;padding:11px 10px;align-items:center;}'
+ '.fbn-sk i{display:block;background:linear-gradient(90deg,#eef2ef,#f7faf8,#eef2ef);background-size:200% 100%;animation:fbnSk 1.1s linear infinite;border-radius:8px;}'
+ '@keyframes fbnSk{from{background-position:200% 0}to{background-position:-200% 0}}'
+ '.fbn-more{margin:8px auto 12px;display:block;border:none;background:var(--pale,#e8f5ee);color:var(--emerald,#1e5c36);font-family:inherit;font-size:.79rem;font-weight:800;padding:8px 20px;border-radius:99px;cursor:pointer;}'
+ '.fbn-more:hover{background:var(--border,#dce8e0);}'
/* نافذة كل الإشعارات */
+ '.fbn-ov{position:fixed;inset:0;background:rgba(15,35,24,.45);z-index:12500;display:none;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;backdrop-filter:blur(2px);}'
+ '.fbn-ov.open{display:flex;}'
+ '.fbn-mod{background:#fff;border-radius:18px;width:100%;max-width:640px;box-shadow:0 20px 60px rgba(15,35,24,.3);overflow:hidden;animation:fbnIn .18s ease both;}'
+ '.fbn-mod .fbn-list{max-height:min(66vh,620px);}'
/* بطاقة الإشعار المنبثقة */
+ '.fbn-pops{position:fixed;bottom:18px;left:18px;z-index:13000;display:flex;flex-direction:column;gap:10px;max-width:calc(100vw - 36px);}'
+ '.fbn-pop{display:flex;gap:11px;align-items:flex-start;width:352px;max-width:100%;background:#fff;border:1px solid var(--border,#dce8e0);border-radius:14px;box-shadow:0 10px 34px rgba(15,35,24,.22);padding:12px 34px 12px 12px;cursor:pointer;position:relative;animation:fbnPop .26s cubic-bezier(.2,.8,.3,1) both;}'
+ '@keyframes fbnPop{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}'
+ '.fbn-pop.out{animation:fbnOut .22s ease forwards;}'
+ '@keyframes fbnOut{to{opacity:0;transform:translateX(-24px)}}'
+ '.fbn-pop-x{position:absolute;left:7px;top:7px;width:22px;height:22px;border:none;background:var(--pale,#e8f5ee);color:var(--mid,#4a5e52);border-radius:50%;cursor:pointer;font-size:.85rem;font-weight:900;line-height:1;padding:0;}'
+ '@media(max-width:640px){'
+ '.fbn-dd{position:fixed;top:60px;left:10px;right:10px;width:auto;max-width:none;}'
+ '.fbn-list{max-height:calc(100vh - 210px);}'
+ '.fbn-pops{left:10px;right:10px;bottom:10px;}.fbn-pop{width:100%;}'
+ '}';

function injectCSS() {
  if (document.getElementById('fbn-css')) return;
  var s = document.createElement('style');
  s.id = 'fbn-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

/* ══════════ بناء الواجهة ══════════ */
var $bell, $cnt, $dd, $list, $menu, $ov, $ovList, $pops;

function buildUI() {
  injectCSS();
  var right = document.querySelector('.topbar .tb-right') || document.querySelector('.tb-right');
  if (!right) return false;

  var wrap = document.createElement('div');
  wrap.className = 'fbn-wrap';
  wrap.innerHTML = ''
    + '<div class="fbn-bell" id="fbn-bell" title="الإشعارات">'
    +   '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
    +   '<span class="fbn-cnt" id="fbn-cnt"></span>'
    + '</div>'
    + '<div class="fbn-dd" id="fbn-dd">'
    +   '<div class="fbn-hd"><h4>الإشعارات</h4>'
    +     '<button class="fbn-hbtn" id="fbn-opt" title="خيارات">⋯</button></div>'
    +   '<div class="fbn-pills">'
    +     '<button class="fbn-pill on" data-f="all">الكل</button>'
    +     '<button class="fbn-pill" data-f="unread">غير المقروءة</button>'
    +   '</div>'
    +   '<div class="fbn-list" id="fbn-list"></div>'
    +   '<div class="fbn-ft" id="fbn-all">عرض كل الإشعارات</div>'
    + '</div>';

  var date = right.querySelector('.tb-date');
  if (date) right.insertBefore(wrap, date); else right.appendChild(wrap);

  $bell = wrap.querySelector('#fbn-bell');
  $cnt  = wrap.querySelector('#fbn-cnt');
  $dd   = wrap.querySelector('#fbn-dd');
  $list = wrap.querySelector('#fbn-list');

  $menu = document.createElement('div');
  $menu.className = 'fbn-menu'; $menu.id = 'fbn-menu';
  document.body.appendChild($menu);

  $ov = document.createElement('div');
  $ov.className = 'fbn-ov'; $ov.id = 'fbn-ov';
  $ov.innerHTML = ''
    + '<div class="fbn-mod">'
    +   '<div class="fbn-hd" style="padding:16px 18px 10px;"><h4>كل الإشعارات</h4>'
    +     '<button class="fbn-hbtn" id="fbn-ov-x" title="إغلاق">×</button></div>'
    +   '<div class="fbn-pills" id="fbn-ov-pills" style="flex-wrap:wrap;padding:2px 18px 12px;"></div>'
    +   '<div class="fbn-list" id="fbn-ov-list" style="padding:0 10px 10px;"></div>'
    + '</div>';
  document.body.appendChild($ov);
  $ovList = $ov.querySelector('#fbn-ov-list');

  $pops = document.createElement('div');
  $pops.className = 'fbn-pops'; $pops.id = 'fbn-pops';
  document.body.appendChild($pops);

  /* أحداث */
  $bell.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
  $dd.addEventListener('click', function (e) { e.stopPropagation(); });
  wrap.querySelector('#fbn-opt').addEventListener('click', function (e) { e.stopPropagation(); optionsMenu(e.currentTarget); });
  wrap.querySelector('#fbn-all').addEventListener('click', function () { close(); openAll(); });
  wrap.querySelectorAll('.fbn-pill').forEach(function (b) {
    b.addEventListener('click', function () { setFilter(b.getAttribute('data-f')); });
  });
  $list.addEventListener('click', onListClick);
  $ovList.addEventListener('click', onListClick);
  $ov.querySelector('#fbn-ov-x').addEventListener('click', closeAll);
  $ov.addEventListener('click', function (e) { if (e.target === $ov) closeAll(); });
  document.addEventListener('click', function () { close(); hideMenu(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { close(); hideMenu(); closeAll(); }
  });
  return true;
}

/* ══════════ رسم القائمة ══════════ */
function skeleton() {
  var h = '';
  for (var i = 0; i < 4; i++) {
    h += '<div class="fbn-sk"><i style="width:48px;height:48px;border-radius:50%"></i>'
      + '<div style="flex:1"><i style="width:78%;height:11px;margin-bottom:7px"></i><i style="width:45%;height:9px"></i></div></div>';
  }
  return h;
}
function emptyBox(txt) {
  return '<div class="fbn-empty"><svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><div>' + esc(txt) + '</div></div>';
}
function visible() {
  return FILTER === 'all' ? ITEMS
       : FILTER === 'unread' ? ITEMS.filter(function (n) { return !n.is_read; })
       : ITEMS.filter(function (n) { return (n.type || '').indexOf(FILTER) === 0; });
}
function itemHTML(n) {
  var t = T(n.type), who = n.actor_name || 'النظام';
  var head = '<b>' + esc(who) + '</b> ' + esc(n.title || '');
  return '<div class="fbn-it ' + (n.is_read ? '' : 'un') + '" data-id="' + esc(n.id) + '">'
    + '<div class="fbn-av" style="background:' + avColor(who) + '">' + esc(initial(who))
    +   '<span class="fbn-avb" style="background:' + t.c + '">' + t.i + '</span>'
    + '</div>'
    + '<div class="fbn-tx">'
    +   '<div class="fbn-t1">' + head + '</div>'
    +   (n.body ? '<div class="fbn-t2">' + esc(n.body) + '</div>' : '')
    +   '<div class="fbn-t3">' + esc(fmtTime(n.created_at)) + ' · ' + esc(t.l) + '</div>'
    + '</div>'
    + (n.is_read ? '' : '<span class="fbn-dot"></span>')
    + '<button class="fbn-mb" data-menu="' + esc(n.id) + '" title="خيارات">⋯</button>'
    + '</div>';
}
function listHTML(arr, grouped) {
  if (!arr.length) return emptyBox(FILTER === 'unread' ? 'مفيش إشعارات غير مقروءة' : 'مفيش إشعارات لسه');
  var h = '', last = '';
  arr.forEach(function (n) {
    if (grouped) {
      var g = dayGroup(n.created_at);
      if (g !== last) { h += '<div class="fbn-grp">' + g + '</div>'; last = g; }
    }
    h += itemHTML(n);
  });
  return h;
}
function render() {
  if ($list) {
    $list.innerHTML = listHTML(visible().slice(0, PAGE_SIZE * 3), true)
      + (HAS_MORE && FILTER === 'all' ? '<button class="fbn-more" data-load="1">عرض إشعارات أقدم</button>' : '');
  }
  if ($ov && $ov.classList.contains('open')) renderAll();
  paintBell();
}
function paintBell() {
  if (!$cnt) return;
  $cnt.textContent = UNREAD > 99 ? '+٩٩' : (UNREAD > 0 ? ar(UNREAD) : '');
  $cnt.classList.toggle('on', UNREAD > 0);
  var t = document.getElementById('fbn-bell');
  if (t) t.title = UNREAD > 0 ? 'عندك ' + ar(UNREAD) + ' إشعار جديد' : 'الإشعارات';
}

/* ══════════ نافذة كل الإشعارات ══════════ */
var OV_F = 'all';
var OV_TABS = [
  ['all', 'الكل'], ['unread', 'غير المقروءة'], ['message', 'الرسائل'],
  ['announcement', 'الإعلانات'], ['lesson_prep', 'تحضير الدروس'],
  ['alert_action', 'التنبيهات'], ['points', 'النقاط'], ['session', 'الزيارات']
];
function ovVisible() {
  if (OV_F === 'all') return ITEMS;
  if (OV_F === 'unread') return ITEMS.filter(function (n) { return !n.is_read; });
  return ITEMS.filter(function (n) { return (n.type || '').indexOf(OV_F) === 0; });
}
function renderAll() {
  var p = $ov.querySelector('#fbn-ov-pills');
  p.innerHTML = OV_TABS.map(function (t) {
    var c = t[0] === 'unread' ? UNREAD
          : t[0] === 'all' ? ITEMS.length
          : ITEMS.filter(function (n) { return (n.type || '').indexOf(t[0]) === 0; }).length;
    return '<button class="fbn-pill ' + (OV_F === t[0] ? 'on' : '') + '" data-ovf="' + t[0] + '">'
      + t[1] + (c ? ' <small style="opacity:.65">' + ar(c) + '</small>' : '') + '</button>';
  }).join('');
  p.querySelectorAll('[data-ovf]').forEach(function (b) {
    b.addEventListener('click', function () { OV_F = b.getAttribute('data-ovf'); renderAll(); });
  });
  var arr = ovVisible();
  $ovList.innerHTML = (arr.length ? listHTML(arr, true) : emptyBox('مفيش إشعارات في القسم ده'))
    + (HAS_MORE ? '<button class="fbn-more" data-load="1">تحميل المزيد</button>' : '');
}
function openAll() { OV_F = 'all'; renderAll(); $ov.classList.add('open'); }
function closeAll() { if ($ov) $ov.classList.remove('open'); }

/* ══════════ تفاعل القائمة ══════════ */
function onListClick(e) {
  var mb = e.target.closest('[data-menu]');
  if (mb) { e.stopPropagation(); itemMenu(mb, mb.getAttribute('data-menu')); return; }
  if (e.target.closest('[data-load]')) { e.stopPropagation(); loadMore(); return; }
  var it = e.target.closest('.fbn-it');
  if (!it) return;
  openItem(it.getAttribute('data-id'));
}
function findItem(id) {
  for (var i = 0; i < ITEMS.length; i++) if (String(ITEMS[i].id) === String(id)) return ITEMS[i];
  return null;
}
function openItem(id) {
  var n = findItem(id);
  if (!n) return;
  if (!n.is_read) markRead([n.id]);
  hideMenu(); close(); closeAll();
  goTo(n);
}
function goTo(n) {
  var page = n.link || T(n.type).p;
  if (!page) return;
  if (!document.getElementById('page-' + page)) {
    if (typeof showToast === 'function') showToast('ℹ️ القسم ده مش متاح في لوحتك');
    return;
  }
  try {
    if (typeof navPage === 'function') navPage(page);
    else if (typeof nav === 'function') {
      var el = document.querySelector('.sb-item[onclick*="\'' + page + '\'"]');
      nav(el, page);
    }
  } catch (err) { /* التنقل مش شرط ينجح */ }
}

/* ══════════ القوائم المنسدلة ══════════ */
function showMenu(html, anchor) {
  $menu.innerHTML = html;
  $menu.classList.add('open');
  var r = anchor.getBoundingClientRect(), m = $menu.getBoundingClientRect();
  var top = r.bottom + 6, left = r.left;
  if (top + m.height > innerHeight - 8) top = Math.max(8, r.top - m.height - 6);
  if (left + m.width > innerWidth - 8) left = innerWidth - m.width - 8;
  if (left < 8) left = 8;
  $menu.style.top = top + 'px'; $menu.style.left = left + 'px';
}
function hideMenu() { if ($menu) { $menu.classList.remove('open'); MENU_ID = null; } }
function itemMenu(btn, id) {
  var n = findItem(id); if (!n) return;
  MENU_ID = id;
  showMenu(
    '<div class="fbn-mi" data-a="read">' + (n.is_read ? '📩 تعليم كغير مقروء' : '✔️ تعليم كمقروء') + '</div>'
    + '<div class="fbn-mi" data-a="open">↗️ فتح القسم</div>'
    + '<div class="fbn-mi dg" data-a="del">🗑️ حذف الإشعار</div>', btn);
  $menu.querySelectorAll('[data-a]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var a = el.getAttribute('data-a');
      hideMenu();
      if (a === 'read') n.is_read ? markUnread(id) : markRead([id]);
      else if (a === 'open') openItem(id);
      else if (a === 'del') removeItem(id);
    });
  });
}
function optionsMenu(btn) {
  var snd = localStorage.getItem(LS_SOUND) !== '0';
  var dsk = localStorage.getItem(LS_DESK) === '1';
  showMenu(
    '<div class="fbn-mi" data-a="all">✔️ تعليم الكل كمقروء</div>'
    + '<div class="fbn-mi" data-a="page">🗂️ فتح كل الإشعارات</div>'
    + '<div class="fbn-mi" data-a="snd">🔊 صوت التنبيه <small>' + (snd ? 'مُفعّل' : 'موقوف') + '</small></div>'
    + '<div class="fbn-mi" data-a="dsk">🖥️ إشعارات سطح المكتب <small>' + (dsk ? 'مُفعّل' : 'موقوف') + '</small></div>'
    + '<div class="fbn-mi dg" data-a="clr">🧹 حذف المقروء</div>', btn);
  $menu.querySelectorAll('[data-a]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var a = el.getAttribute('data-a'); hideMenu();
      if (a === 'all') markAll();
      else if (a === 'page') { close(); openAll(); }
      else if (a === 'snd') {
        localStorage.setItem(LS_SOUND, snd ? '0' : '1');
        if (typeof showToast === 'function') showToast(snd ? '🔇 تم إيقاف صوت الإشعارات' : '🔊 تم تفعيل صوت الإشعارات');
      } else if (a === 'dsk') toggleDesktop(dsk);
      else if (a === 'clr') clearRead();
    });
  });
}
function toggleDesktop(on) {
  if (on) {
    localStorage.setItem(LS_DESK, '0');
    if (typeof showToast === 'function') showToast('🖥️ تم إيقاف إشعارات سطح المكتب');
    return;
  }
  if (!('Notification' in window)) {
    if (typeof showToast === 'function') showToast('⚠️ المتصفح ده مش بيدعم إشعارات سطح المكتب');
    return;
  }
  Notification.requestPermission().then(function (p) {
    if (p === 'granted') {
      localStorage.setItem(LS_DESK, '1');
      if (typeof showToast === 'function') showToast('✅ تم تفعيل إشعارات سطح المكتب');
    } else if (typeof showToast === 'function') showToast('⚠️ لازم تسمح بالإشعارات من إعدادات المتصفح');
  });
}

/* ══════════ الفتح والإغلاق ══════════ */
function toggle() { OPEN ? close() : open(); }
function open() {
  if (!$dd) return;
  OPEN = true;
  $dd.classList.add('open'); $bell.classList.add('act');
  if (!ITEMS.length) $list.innerHTML = skeleton();
  load(true);
}
function close() {
  if (!$dd) return;
  OPEN = false;
  $dd.classList.remove('open'); $bell.classList.remove('act');
  hideMenu();
}
function setFilter(f) {
  FILTER = (f === 'unread') ? 'unread' : 'all';
  if ($dd) $dd.querySelectorAll('.fbn-pill').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-f') === FILTER);
  });
  render();
}

/* ══════════ البيانات ══════════ */
function me() {
  var cu = {};
  try { cu = JSON.parse(localStorage.getItem('currentUser') || '{}'); } catch (e) { cu = {}; }
  MY.id = String(cu.id || '');
  MY.name = cu.full_name || '';
  MY.role = cu.role || '';
  return MY.id;
}
async function countUnread() {
  if (!MY.id) return;
  try {
    var r = await db.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', MY.id).eq('is_read', false);
    if (!r.error) { UNREAD = r.count || 0; paintBell(); }
  } catch (e) { /* الشبكة — نعيد المحاولة في الدورة الجاية */ }
}
async function load(reset) {
  if (!MY.id || LOADING) return;
  LOADING = true;
  var from = reset ? 0 : ITEMS.length;
  try {
    var r = await db.from('notifications').select('*')
      .eq('user_id', MY.id)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (r.error) throw r.error;
    var rows = r.data || [];
    if (reset) ITEMS = rows;
    else {
      var have = {}; ITEMS.forEach(function (x) { have[x.id] = 1; });
      rows.forEach(function (x) { if (!have[x.id]) ITEMS.push(x); });
    }
    HAS_MORE = rows.length === PAGE_SIZE;
  } catch (e) {
    if (reset && $list) $list.innerHTML = emptyBox(errMsg(e));
    LOADING = false; return;
  }
  LOADING = false;
  await countUnread();
  render();
}
function loadMore() { load(false); }
function errMsg(e) {
  var m = (e && (e.message || e.msg)) || '';
  if (/42P01|does not exist|relation/i.test(m)) return 'جدول notifications مش موجود — شغّل ملفات SQL';
  if (/JWT|not authenticated|401/i.test(m)) return 'الجلسة انتهت — سجّل الدخول تاني';
  if (/policy|row-level|403/i.test(m)) return 'الصلاحية مرفوضة (RLS)';
  return 'تعذّر تحميل الإشعارات';
}
async function markRead(ids) {
  ids = (ids || []).map(String);
  if (!ids.length) return;
  ITEMS.forEach(function (n) { if (ids.indexOf(String(n.id)) > -1 && !n.is_read) { n.is_read = true; UNREAD = Math.max(0, UNREAD - 1); } });
  render();
  try {
    var r = await db.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', ids).eq('user_id', MY.id).select('id');
    if (r.error || !r.data || !r.data.length) throw (r.error || new Error('صفر صفوف'));
  } catch (e) {
    if (typeof showToast === 'function') showToast('⚠️ لم يُحفظ تعليم الإشعار كمقروء');
    load(true);
  }
}
async function markUnread(id) {
  var n = findItem(id); if (!n) return;
  n.is_read = false; UNREAD++; render();
  try {
    var r = await db.from('notifications').update({ is_read: false, read_at: null })
      .eq('id', id).eq('user_id', MY.id).select('id');
    if (r.error || !r.data || !r.data.length) throw (r.error || new Error('صفر صفوف'));
  } catch (e) { load(true); }
}
async function markAll() {
  if (!UNREAD) { if (typeof showToast === 'function') showToast('✔️ كل الإشعارات مقروءة بالفعل'); return; }
  ITEMS.forEach(function (n) { n.is_read = true; });
  UNREAD = 0; render();
  try {
    var r = await db.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', MY.id).eq('is_read', false).select('id');
    if (r.error) throw r.error;
    if (typeof showToast === 'function') showToast('✔️ تم تعليم كل الإشعارات كمقروءة');
  } catch (e) {
    if (typeof showToast === 'function') showToast('❌ تعذّر التحديث — حاول تاني');
    load(true);
  }
}
async function removeItem(id) {
  ITEMS = ITEMS.filter(function (n) { return String(n.id) !== String(id); });
  render();
  try {
    var r = await db.from('notifications').delete().eq('id', id).eq('user_id', MY.id).select('id');
    if (r.error || !r.data || !r.data.length) throw (r.error || new Error('صفر صفوف'));
  } catch (e) {
    if (typeof showToast === 'function') showToast('⚠️ تعذّر حذف الإشعار');
    load(true);
  }
}
async function clearRead() {
  if (!confirm('حذف كل الإشعارات المقروءة نهائياً؟')) return;
  try {
    var r = await db.from('notifications').delete().eq('user_id', MY.id).eq('is_read', true).select('id');
    if (r.error) throw r.error;
    if (typeof showToast === 'function') showToast('🧹 تم حذف ' + ar((r.data || []).length) + ' إشعار مقروء');
    load(true);
  } catch (e) {
    if (typeof showToast === 'function') showToast('❌ تعذّر الحذف');
  }
}

/* ══════════ الإشعار الجديد ══════════ */
function onNew(row) {
  if (!row || String(row.user_id) !== MY.id) return;
  if (findItem(row.id)) return;
  ITEMS.unshift(row);
  if (!row.is_read) UNREAD++;
  render();
  if ($bell) { $bell.classList.remove('ring'); void $bell.offsetWidth; $bell.classList.add('ring'); }
  popCard(row); beep(); desktop(row);
}
function popCard(n) {
  if (!$pops) return;
  var t = T(n.type), who = n.actor_name || 'النظام';
  var d = document.createElement('div');
  d.className = 'fbn-pop';
  d.innerHTML = '<div class="fbn-av" style="background:' + avColor(who) + '">' + esc(initial(who))
    + '<span class="fbn-avb" style="background:' + t.c + '">' + t.i + '</span></div>'
    + '<div class="fbn-tx"><div class="fbn-t1"><b>' + esc(who) + '</b> ' + esc(n.title || '') + '</div>'
    + (n.body ? '<div class="fbn-t2">' + esc(n.body) + '</div>' : '')
    + '<div class="fbn-t3" style="color:var(--jade,#2d7a50)">الآن · ' + esc(t.l) + '</div></div>'
    + '<button class="fbn-pop-x" title="إغلاق">×</button>';
  d.addEventListener('click', function (e) {
    if (e.target.closest('.fbn-pop-x')) { bye(d); return; }
    bye(d); openItem(n.id);
  });
  $pops.appendChild(d);
  if ($pops.children.length > 3) bye($pops.firstElementChild);
  setTimeout(function () { bye(d); }, 8000);
}
function bye(el) {
  if (!el || !el.parentNode) return;
  el.classList.add('out');
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
}
function beep() {
  if (localStorage.getItem(LS_SOUND) === '0') return;
  try {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    var c = new AC(), t = c.currentTime;
    [[880, 0], [1320, .09]].forEach(function (p) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = p[0];
      g.gain.setValueAtTime(0, t + p[1]);
      g.gain.linearRampToValueAtTime(.075, t + p[1] + .012);
      g.gain.exponentialRampToValueAtTime(.0001, t + p[1] + .19);
      o.connect(g); g.connect(c.destination);
      o.start(t + p[1]); o.stop(t + p[1] + .21);
    });
    setTimeout(function () { try { c.close(); } catch (e) {} }, 700);
  } catch (e) { /* الصوت مش شرط يشتغل */ }
}
function desktop(n) {
  if (localStorage.getItem(LS_DESK) !== '1') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    var nt = new Notification((n.actor_name || 'مدرسة التوحيد') + ' — ' + (n.title || 'إشعار جديد'), {
      body: n.body || '', tag: 'fbn-' + n.id, lang: 'ar', dir: 'rtl'
    });
    nt.onclick = function () { window.focus(); openItem(n.id); nt.close(); };
  } catch (e) { /* بعض المتصفحات بتمنعه */ }
}

/* ══════════ Realtime + Polling ══════════ */
function startRT() {
  try {
    if (RT) { try { db.removeChannel(RT); } catch (e) {} RT = null; }
    RT = db.channel('fbn_' + MY.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + MY.id },
        function (p) { onNew(p.new); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + MY.id },
        function (p) {
          var n = findItem(p.new.id);
          if (n) { Object.assign(n, p.new); countUnread(); render(); }
        })
      .subscribe();
  } catch (e) { /* Realtime مش مفعّل — الـ polling هيغطّي */ }
}
function startPoll() {
  if (POLL) clearInterval(POLL);
  POLL = setInterval(function () {
    if (document.hidden) return;
    var before = UNREAD;
    countUnread().then(function () {
      if (UNREAD !== before || OPEN) load(true);
    });
  }, POLL_MS);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { countUnread(); if (OPEN) load(true); }
  });
}

/* ══════════ الإقلاع ══════════ */
async function boot() {
  if (BOOTED) return;
  if (typeof window.db === 'undefined') { setTimeout(boot, 400); return; }
  if (!buildUI()) { setTimeout(boot, 400); return; }
  BOOTED = true;
  try { await db.auth.getSession(); } catch (e) {}
  if (!me()) { setTimeout(function () { if (me()) { load(true); startRT(); } }, 1500); }
  await load(true);
  startRT();
  startPoll();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* ══════════ واجهة برمجية عامة ══════════ */
window.NotifSys = {
  boot: boot, load: load, refresh: function () { countUnread(); },
  open: open, close: close, toggle: toggle, openAll: openAll,
  markRead: markRead, markAll: markAll, remove: removeItem,
  unread: function () { return UNREAD; }, items: function () { return ITEMS.slice(); },
  /* إرسال إشعار لمستخدم/مستخدمين عبر RPC آمنة */
  send: async function (userIds, type, title, body, link, refId, meta) {
    var ids = Array.isArray(userIds) ? userIds : [userIds];
    ids = ids.filter(Boolean).map(String);
    if (!ids.length) return 0;
    try {
      var r = await db.rpc('notify_users', {
        p_user_ids: ids, p_type: type || 'system', p_title: title || '',
        p_body: body || null, p_link: link || null, p_ref_id: refId || null,
        p_meta: meta || {}
      });
      if (r.error) throw r.error;
      return r.data || 0;
    } catch (e) { return 0; }
  }
};

/* ══════════ توافق مع النداءات القديمة ══════════ */
window._notifUpdateBell   = function () { countUnread(); };
window.loadNotifications  = function () { return load(true); };
window.renderNotifications = function () { render(); };
window.toggleNotifDropdown = function () { toggle(); };
window.markAllNotifRead   = function () { markAll(); };
window.switchNotifTab     = function (t) { setFilter(t === 'unread' ? 'unread' : 'all'); };
window.notifReadMsg = function () {}; window.notifReadAnn = function () {}; window.notifReadAct = function () {};
window._notifAddMsg = function () { countUnread(); };
window.logSupervisorAction = function () {};
window.goToMessages = function () { close(); if (document.getElementById('page-messages')) goTo({ link: 'messages' }); };
if (typeof window.NOTIF_MSG_DATA === 'undefined') window.NOTIF_MSG_DATA = [];
})();
