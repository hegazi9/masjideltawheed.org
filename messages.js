/* ═══════════════════════════════════════════════════════════════════════
   messages.js — واجهة الرسائل (بنفس لغة تصميم الإشعارات)
   مدرسة التوحيد القرآنية | يعمل في لوحات: المعلم • المشرف • المدير
   يُحمَّل قبل </body> عشان يقدر يستبدل دوال العرض الأصلية
   البيانات كلها من جدول public.messages — مفيش localStorage
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
if (window.MsgUI) return;

var UNREAD_ONLY = false;

/* ── وصول آمن للمتغيرات العامة (معرّفة بـ let/const فمش على window) ── */
function MD()  { return (typeof MESSAGES_DATA !== 'undefined' && MESSAGES_DATA) ? MESSAGES_DATA : []; }
function CF()  { return (typeof MSG_CURRENT_FOLDER !== 'undefined') ? MSG_CURRENT_FOLDER : 'inbox'; }
function SEL() { return (typeof MSG_SELECTED_IDS !== 'undefined' && MSG_SELECTED_IDS) ? MSG_SELECTED_IDS : null; }
function RC()  { return (typeof MSG_ROLE_COLORS !== 'undefined') ? MSG_ROLE_COLORS : {}; }
function RL()  { return (typeof MSG_ROLE_LABELS !== 'undefined') ? MSG_ROLE_LABELS : {}; }
function OPENID(){ return (typeof MSG_OPEN_ID !== 'undefined') ? MSG_OPEN_ID : null; }
function setFolder(f){ try { MSG_CURRENT_FOLDER = f; } catch (e) { window.MSG_CURRENT_FOLDER = f; } }
function setOpen(id){ try { MSG_OPEN_ID = id; } catch (e) { window.MSG_OPEN_ID = id; } }
var RT = null;
var BOOTED = false;

/* ══════════ أدوات ══════════ */
function ar(n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function myUser() {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}'); } catch (e) { return {}; }
}
function initial(name) {
  var t = String(name || '؟').trim().replace(/^(الشيخ|الأستاذة|الأستاذ|د\.|أ\.|م\.)\s*/, '');
  return t.charAt(0) || '؟';
}
function roleColor(r) {
  var C = RC();
  return C[r] || '#2d7a50';
}
function roleLabel(r) {
  var L = RL();
  return L[r] || r || '—';
}
function tAgo(iso) {
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
function ic(p) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
}
var ROLE_ICON = {
  admin:      ic('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  supervisor: ic('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  teacher:    ic('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  parent:     ic('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>'),
  student:    ic('<path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>')
};
function roleIcon(r) { return ROLE_ICON[r] || ROLE_ICON.student; }

/* ══════════ الشكل ══════════ */
var CSS = ''
/* ── الإطار العام ── */
+ '.msg-layout{border:1px solid var(--border);box-shadow:var(--shadow);height:calc(100vh - 168px);}'
+ '.msg-sidebar{width:214px;background:linear-gradient(180deg,var(--white),var(--bg));padding:12px 0 8px;}'
/* ── الفولدرات ── */
+ '.msg-folder{margin:0 8px 3px 10px;border-radius:10px;padding:9px 12px;gap:10px;font-size:.83rem;font-weight:700;}'
+ '.msg-folder:hover{background:var(--pale);}'
+ '.msg-folder.active{background:var(--pale);color:var(--emerald);box-shadow:inset 0 0 0 1.5px var(--jade);}'
+ '.msg-folder-icon{width:20px;height:20px;display:flex;align-items:center;justify-content:center;}'
+ '.msg-folder-count{font-size:.68rem;font-weight:800;background:var(--border);color:var(--mid);padding:2px 8px;min-width:22px;line-height:1.3;}'
+ '.msg-folder-count.hot{background:#e0245e;color:#fff;box-shadow:0 1px 4px rgba(224,36,94,.35);}'
/* ── الشريط العلوي ── */
+ '.msg-toolbar{padding:11px 16px;gap:10px;background:var(--white);}'
+ '.msg-tool-btn{border-radius:9px;font-weight:700;}'
+ '.msg-search-wrap{border-radius:10px;padding:7px 13px;}'
+ '.msg-search-wrap input{width:210px;}'
+ '.mx-chip{border:none;background:var(--pale);color:var(--mid);font-family:inherit;font-size:.78rem;font-weight:800;padding:6px 14px;border-radius:99px;cursor:pointer;transition:.14s;white-space:nowrap;}'
+ '.mx-chip:hover{background:var(--border);}'
+ '.mx-chip.on{color:var(--emerald);box-shadow:inset 0 0 0 1.5px var(--jade);}'
/* ── صف الرسالة ── */
+ '.msg-list-panel{padding:6px;background:var(--white);}'
+ '.mx-grp{font-size:.75rem;font-weight:800;color:var(--forest);padding:12px 12px 6px;}'
+ '.msg-layout .msg-row{position:relative;display:flex;align-items:flex-start;gap:11px;padding:11px 40px 11px 12px;border:none;border-radius:12px;margin-bottom:2px;transition:background .13s;}'
+ '.msg-layout .msg-row:hover{background:#f2f6f3;}'
+ '.msg-layout .msg-row.unread{background:rgba(45,122,80,.055);}'
+ '.msg-layout .msg-row.unread:hover{background:rgba(45,122,80,.10);}'
+ '.msg-layout .msg-row.selected{background:var(--pale);box-shadow:inset 0 0 0 1.5px var(--jade);}'
+ '.msg-layout .msg-row.urg::before{content:"";position:absolute;right:0;top:12px;bottom:12px;width:3px;border-radius:99px;background:var(--red);}'
+ '.msg-row-check{padding-top:14px;}'
+ '.mx-av{position:relative;width:44px;height:44px;border-radius:50%;flex:0 0 44px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.05rem;font-weight:800;}'
+ '.mx-avb{position:absolute;bottom:-2px;left:-3px;width:20px;height:20px;border-radius:50%;border:2px solid var(--white);display:flex;align-items:center;justify-content:center;}'
+ '.mx-avb svg{width:11px;height:11px;}'
+ '.msg-row-content{flex:1;min-width:0;padding-top:1px;}'
+ '.msg-row-top{display:flex;align-items:center;gap:7px;margin-bottom:2px;}'
+ '.msg-row-sender{font-size:.86rem;font-weight:800;color:var(--forest);max-width:150px;}'
+ '.mx-role{font-size:.64rem;font-weight:800;padding:1px 7px;border-radius:99px;background:var(--pale);color:var(--emerald);white-space:nowrap;}'
+ '.mx-urg{font-size:.63rem;font-weight:800;padding:1px 7px;border-radius:99px;background:var(--red-pale);color:var(--red);white-space:nowrap;}'
+ '.mx-time{margin-right:auto;font-size:.71rem;font-weight:700;color:var(--light);white-space:nowrap;}'
+ '.msg-row.unread .mx-time{color:var(--jade);}'
+ '.mx-subj{font-size:.83rem;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
+ '.msg-row.unread .mx-subj{font-weight:800;color:var(--forest);}'
+ '.msg-row-preview{font-size:.755rem;color:var(--light);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
+ '.mx-dot{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:10px;height:10px;border-radius:50%;background:var(--jade);}'
+ '.mx-acts{position:absolute;left:8px;top:8px;display:none;gap:4px;background:var(--white);border:1px solid var(--border);border-radius:99px;padding:3px;box-shadow:0 3px 12px rgba(15,35,24,.12);}'
+ '.msg-row:hover .mx-acts{display:flex;}'
+ '.msg-row:hover .mx-dot{display:none;}'
+ '.mx-a{width:26px;height:26px;border:none;background:transparent;border-radius:50%;cursor:pointer;color:var(--mid);display:flex;align-items:center;justify-content:center;padding:0;}'
+ '.mx-a:hover{background:var(--pale);color:var(--emerald);}'
+ '.mx-a.dg:hover{background:var(--red-pale);color:var(--red);}'
+ '.mx-a.st{color:var(--gold);}'
/* ── هيكل التحميل ── */
+ '.mx-sk{display:flex;gap:11px;padding:12px;align-items:center;}'
+ '.mx-sk i{display:block;background:linear-gradient(90deg,#eef2ef,#f7faf8,#eef2ef);background-size:200% 100%;animation:mxSk 1.1s linear infinite;border-radius:8px;}'
+ '@keyframes mxSk{from{background-position:200% 0}to{background-position:-200% 0}}'
/* ── التفاصيل ── */
+ '.msg-detail-panel{background:var(--white);}'
+ '.msg-detail-head{padding:12px 16px;border-bottom:1px solid var(--border);gap:10px;}'
+ '.msg-detail-subject{font-size:1.02rem;font-weight:900;color:var(--forest);}'
+ '.msg-detail-meta{padding:14px 18px;gap:13px;align-items:center;background:var(--bg);border-bottom:1px solid var(--border);}'
+ '.msg-avatar-lg{position:relative;width:52px;height:52px;border-radius:50%;font-size:1.25rem;font-weight:800;}'
+ '.msg-role-badge{font-size:.68rem;font-weight:800;padding:2px 9px;border-radius:99px;background:var(--pale);color:var(--emerald);}'
+ '.msg-detail-body{padding:20px 22px;font-size:.92rem;line-height:2;color:var(--ink);white-space:pre-wrap;}'
/* ── سلسلة المحادثة ── */
+ '.mx-thread{border-top:1px solid var(--border);padding:14px 18px 4px;background:var(--bg);}'
+ '.mx-th-h{display:flex;align-items:center;gap:8px;font-size:.78rem;font-weight:800;color:var(--mid);cursor:pointer;user-select:none;margin-bottom:10px;}'
+ '.mx-th-h .cnt{background:var(--pale);color:var(--emerald);border-radius:99px;padding:1px 8px;font-size:.7rem;}'
+ '.mx-th-b{display:none;flex-direction:column;gap:8px;padding-bottom:10px;}'
+ '.mx-thread.open .mx-th-b{display:flex;}'
+ '.mx-bub{max-width:78%;padding:9px 13px;border-radius:14px;font-size:.82rem;line-height:1.75;background:var(--white);border:1px solid var(--border);cursor:pointer;}'
+ '.mx-bub:hover{border-color:var(--jade);}'
+ '.mx-bub.me{margin-inline-start:auto;background:var(--pale);border-color:transparent;}'
+ '.mx-bub .h{display:flex;gap:8px;align-items:center;font-size:.7rem;font-weight:800;color:var(--mid);margin-bottom:3px;}'
+ '.mx-bub .t{color:var(--light);font-weight:700;}'
/* ── صندوق الرد ── */
+ '.msg-reply-box{border-top:1px solid var(--border);padding:14px 18px;background:var(--white);}'
+ '@media(max-width:900px){'
+ '.msg-layout{flex-direction:column;height:auto;}'
+ '.msg-sidebar{width:auto;display:flex;overflow-x:auto;gap:6px;padding:10px;border-left:none;border-bottom:1px solid var(--border);}'
+ '.msg-folders{display:flex;gap:6px;}'
+ '.msg-folder{margin:0;white-space:nowrap;}'
+ '.msg-folder-label{display:none;}.msg-folder.active .msg-folder-label{display:inline;}'
+ '.msg-search-wrap input{width:120px;}'
+ '.msg-list-panel{max-height:60vh;}'
+ '}';

function injectCSS() {
  if (document.getElementById('mx-css')) return;
  var s = document.createElement('style');
  s.id = 'mx-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

/* ══════════ أيقونات الأزرار ══════════ */
function bic(p, fill) {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + (fill || 'none') + '" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
}
var I_STAR = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';
var I_REPLY = '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>';
var I_TRASH = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>';
var I_MAIL = '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>';
var I_OPEN = '<path d="M4 4h7"/><path d="M20 4h-7v7"/><path d="M20 13v7H4v-7"/>';

/* ══════════ العرض ══════════ */
function skeleton() {
  var h = '';
  for (var i = 0; i < 5; i++) {
    h += '<div class="mx-sk"><i style="width:44px;height:44px;border-radius:50%"></i>'
      + '<div style="flex:1"><i style="width:62%;height:11px;margin-bottom:7px"></i><i style="width:88%;height:9px"></i></div></div>';
  }
  return h;
}

function emptyBox() {
  var names = {
    inbox: 'الوارد', sent: 'المُرسَل', starred: 'المميّزة', drafts: 'المسوّدات', trash: 'المحذوفات',
    teachers: 'رسائل المعلمين', supervisors: 'رسائل المشرفين', parents: 'رسائل أولياء الأمور', students: 'رسائل الطلاب'
  };
  var f = names[CF()] || '';
  return '<div class="msg-empty" style="padding:46px 20px;text-align:center;">'
    + '<div style="width:74px;height:74px;border-radius:50%;background:var(--pale);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">'
    + '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
    + '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg></div>'
    + '<div style="font-size:.95rem;font-weight:800;color:var(--mid);">'
    + (UNREAD_ONLY ? 'مفيش رسائل غير مقروءة' : 'مفيش رسائل') + '</div>'
    + '<div style="font-size:.8rem;color:var(--light);margin-top:3px;">' + esc(f) + ' فاضي حالياً</div></div>';
}

function rowHTML(m) {
  var mine = m.is_mine;
  var who = mine ? (m.to_name || 'غير محدد') : (m.sender_name || 'مجهول');
  var role = mine ? m.to_role : m.sender_role;
  var col = roleColor(role);
  var unread = !m.read && !mine;
  var S = SEL(); var sel = !!(S && S.has(m.id));
  var prev = String(m.body || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  return '<div class="msg-row' + (unread ? ' unread' : '') + (sel ? ' selected' : '') + (m.urgent ? ' urg' : '') + '"'
    + ' id="msg-row-' + m.id + '" onclick="openMessage(' + m.id + ',event)">'
    + '<div class="msg-row-check" onclick="event.stopPropagation()">'
    +   '<input type="checkbox" style="width:15px;height:15px;cursor:pointer;accent-color:var(--jade);"'
    +   (sel ? ' checked' : '') + ' onchange="toggleMsgSelect(' + m.id + ',this)"></div>'
    + '<div class="mx-av" style="background:' + col + '">' + esc(initial(who))
    +   '<span class="mx-avb" style="background:' + col + '">' + roleIcon(role) + '</span></div>'
    + '<div class="msg-row-content">'
    +   '<div class="msg-row-top">'
    +     '<span class="msg-row-sender">' + (mine ? 'إلى: ' : '') + esc(who) + '</span>'
    +     '<span class="mx-role">' + esc(roleLabel(role)) + '</span>'
    +     (m.urgent ? '<span class="mx-urg">عاجل</span>' : '')
    +     (m.draft ? '<span class="mx-urg" style="background:var(--gold-pale);color:var(--gold)">مسوّدة</span>' : '')
    +     '<span class="mx-time">' + esc(tAgo(m.created_at)) + '</span>'
    +   '</div>'
    +   '<div class="mx-subj">' + esc(m.subject || '(بدون موضوع)') + '</div>'
    +   (prev ? '<div class="msg-row-preview">' + esc(prev.substring(0, 110)) + (prev.length > 110 ? '…' : '') + '</div>' : '')
    + '</div>'
    + (unread ? '<span class="mx-dot"></span>' : '')
    + '<div class="mx-acts" onclick="event.stopPropagation()">'
    +   '<button class="mx-a' + (m.starred ? ' st' : '') + '" title="' + (m.starred ? 'إلغاء التمييز' : 'تمييز') + '"'
    +     ' onclick="toggleStar(' + m.id + ',event)">' + bic(I_STAR, m.starred ? 'currentColor' : 'none') + '</button>'
    +   (mine ? '' : '<button class="mx-a" title="رد" onclick="MsgUI.reply(' + m.id + ')">' + bic(I_REPLY) + '</button>')
    +   '<button class="mx-a" title="' + (m.read ? 'تعليم كغير مقروء' : 'تعليم كمقروء') + '"'
    +     ' onclick="MsgUI.toggleRead(' + m.id + ')">' + bic(I_MAIL) + '</button>'
    +   '<button class="mx-a dg" title="حذف" onclick="MsgUI.del(' + m.id + ')">' + bic(I_TRASH) + '</button>'
    + '</div></div>';
}

function renderMessages() {
  var body = document.getElementById('msg-list-body');
  if (!body) return;
  var list = (typeof getFilteredMessages === 'function' ? getFilteredMessages() : []) || [];
  var lbl = document.getElementById('msg-count-label');

  if (!list.length) {
    body.innerHTML = emptyBox();
    if (lbl) lbl.textContent = '';
    return;
  }
  if (lbl) {
    var un = list.filter(function (m) { return !m.read && !m.is_mine; }).length;
    lbl.textContent = ar(list.length) + ' رسالة' + (un ? ' · ' + ar(un) + ' غير مقروءة' : '');
  }

  var h = '', last = '';
  list.forEach(function (m) {
    var g = dayGroup(m.created_at);
    if (g !== last) { h += '<div class="mx-grp">' + g + '</div>'; last = g; }
    h += rowHTML(m);
  });
  body.innerHTML = h;
}

/* ══════════ الفلترة ══════════ */
function getFilteredMessagesX(search) {
  var el = document.getElementById('msg-search');
  var sq = String(search != null ? search : (el ? el.value : '') || '').toLowerCase().trim();
  var D = MD();
  return D.filter(function (m) {
    if (typeof _msgInFolder === 'function' && !_msgInFolder(m, CF())) return false;
    if (UNREAD_ONLY && (m.read || m.is_mine)) return false;
    if (sq) {
      var hay = ((m.subject || '') + ' ' + (m.body || '') + ' ' + (m.sender_name || '') + ' ' + (m.to_name || '')).toLowerCase();
      if (hay.indexOf(sq) < 0) return false;
    }
    return true;
  }).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
}

/* ══════════ عدّادات الفولدرات ══════════ */
function updateFolderCounts() {
  var D = MD();
  var inbox = D.filter(function (m) { return !m.is_mine && !m.deleted && !m.draft && !m.read; }).length;
  var starred = D.filter(function (m) { return m.starred && !m.deleted; }).length;
  var drafts = D.filter(function (m) { return m.draft && !m.deleted; }).length;
  var trash = D.filter(function (m) { return m.deleted; }).length;

  function set(id, n, hot) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = n > 0 ? ar(n > 99 ? '99+' : n) : '';
    el.classList.toggle('hot', !!hot && n > 0);
  }
  set('mf-inbox-count', inbox, true);
  set('mf-sent-count', 0);
  set('mf-starred-count', starred);
  set('mf-drafts-count', drafts);
  set('mf-trash-count', trash);

  if (typeof updateMsgBadge === 'function') updateMsgBadge(inbox);
  if (typeof _notifUpdateBell === 'function') _notifUpdateBell();
}

/* ══════════ فتح الفولدر (من غير تعليم تلقائي كمقروء) ══════════ */
function switchFolderX(el, folder) {
  document.querySelectorAll('.msg-folder').forEach(function (f) { f.classList.remove('active'); });
  if (el) el.classList.add('active');
  setFolder(folder);
  var S = SEL(); if (S) S.clear();
  if (typeof closeDetail === 'function') closeDetail();
  var sa = document.getElementById('msg-select-all'); if (sa) sa.checked = false;
  var db_ = document.getElementById('msg-delete-selected-btn'); if (db_) db_.style.display = 'none';
  renderMessages();
  updateFolderCounts();
}

/* ══════════ فتح الرسالة + سلسلة المحادثة ══════════ */
function threadOf(m) {
  var other = String(m.is_mine ? m.to_id : m.sender_id);
  return MD().filter(function (x) {
    if (x.id === m.id || x.deleted || x.draft) return false;
    return String(x.is_mine ? x.to_id : x.sender_id) === other;
  }).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); }).slice(0, 15);
}

function ensureThreadBox() {
  var box = document.getElementById('mx-thread');
  if (box) return box;
  var body = document.getElementById('detail-body');
  if (!body) return null;
  box = document.createElement('div');
  box.className = 'mx-thread'; box.id = 'mx-thread';
  box.innerHTML = '<div class="mx-th-h" id="mx-th-h">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
    + '<span>سجلّ المراسلات</span><span class="cnt" id="mx-th-c">٠</span></div>'
    + '<div class="mx-th-b" id="mx-th-b"></div>';
  body.parentNode.insertBefore(box, body.nextSibling);
  box.querySelector('#mx-th-h').addEventListener('click', function () { box.classList.toggle('open'); });
  return box;
}

function renderThread(m) {
  var box = ensureThreadBox();
  if (!box) return;
  var list = threadOf(m);
  box.style.display = list.length ? 'block' : 'none';
  if (!list.length) return;
  document.getElementById('mx-th-c').textContent = ar(list.length);
  document.getElementById('mx-th-b').innerHTML = list.map(function (x) {
    var who = x.is_mine ? 'أنت' : (x.sender_name || 'مجهول');
    var txt = String(x.body || '').replace(/<[^>]+>/g, '').trim();
    return '<div class="mx-bub' + (x.is_mine ? ' me' : '') + '" onclick="openMessage(' + x.id + ',event)">'
      + '<div class="h"><span>' + esc(who) + '</span><span class="t">' + esc(tAgo(x.created_at)) + '</span></div>'
      + '<div style="font-weight:700;color:var(--forest);margin-bottom:2px;">' + esc(x.subject || '(بدون موضوع)') + '</div>'
      + esc(txt.substring(0, 180)) + (txt.length > 180 ? '…' : '') + '</div>';
  }).join('');
}

function openMessageX(id, e) {
  if (e && e.target && e.target.type === 'checkbox') return;
  var m = MD().find(function (x) { return x.id === id; });
  if (!m) return;

  if (!m.read && !m.is_mine) {
    m.read = true;
    markReadDB(id);
    var row = document.getElementById('msg-row-' + id);
    if (row) row.classList.remove('unread');
    updateFolderCounts();
  }
  setOpen(id);

  var mine = m.is_mine;
  var who = mine ? (m.to_name || 'غير محدد') : (m.sender_name || 'مجهول');
  var role = mine ? m.to_role : m.sender_role;
  var col = roleColor(role);

  function set(id2, v) { var el = document.getElementById(id2); if (el) el.textContent = v; }
  set('detail-subject', m.subject || '(بدون موضوع)');
  var av = document.getElementById('detail-avatar');
  if (av) {
    av.innerHTML = esc(initial(who)) + '<span class="mx-avb" style="background:' + col + ';width:24px;height:24px;">' + roleIcon(role) + '</span>';
    av.style.background = col;
  }
  set('detail-sender', who);
  set('detail-role-badge', roleLabel(role));
  set('detail-to', mine ? (m.to_name || '—') : 'أنت');
  set('detail-date', typeof formatMsgTimeFull === 'function' ? formatMsgTimeFull(m.created_at) : tAgo(m.created_at));
  set('detail-body', m.body || '');

  var sb = document.getElementById('detail-star-btn');
  if (sb) sb.style.color = m.starred ? 'var(--gold)' : 'var(--mid)';
  var ss = document.getElementById('detail-star-svg');
  if (ss) ss.setAttribute('fill', m.starred ? '#c8920a' : 'none');

  set('reply-to-name', who);
  var rb = document.getElementById('reply-body'); if (rb) rb.value = '';
  var box = document.getElementById('msg-reply-box');
  if (box) box.style.display = mine ? 'none' : 'block';

  renderThread(m);

  var lp = document.getElementById('msg-list-panel'); if (lp) lp.style.display = 'none';
  var dp = document.getElementById('msg-detail-panel'); if (dp) dp.style.display = 'flex';
}

/* ══════════ عمليات على DB (مع كشف فشل RLS) ══════════ */
async function markReadDB(id, val) {
  var v = (val === undefined) ? true : !!val;
  try {
    var r = await db.from('messages')
      .update({ is_read: v }).eq('id', id).select('id');
    if (r.error) throw r.error;
    if (!r.data || !r.data.length) throw new Error('صفر صفوف — مرفوض من RLS');
  } catch (e) {
    if (typeof showToast === 'function') showToast('⚠️ لم تُحفظ حالة القراءة');
  }
}
async function starDB(id, starred) {
  try {
    var r = await db.from('messages').update({ starred: !!starred }).eq('id', id).select('id');
    if (r.error) throw r.error;
    if (!r.data || !r.data.length) throw new Error('صفر صفوف');
    return true;
  } catch (e) {
    if (typeof showToast === 'function') showToast('⚠️ تعذّر حفظ التمييز');
    return false;
  }
}
async function delDB(id) {
  try {
    var r = await db.from('messages').update({ deleted: true }).eq('id', id).select('id');
    if (r.error) throw r.error;
    if (!r.data || !r.data.length) throw new Error('صفر صفوف');
    return true;
  } catch (e) {
    if (typeof showToast === 'function') showToast('❌ تعذّر حذف الرسالة');
    return false;
  }
}

/* ══════════ إجراءات الصف ══════════ */
async function toggleRead(id) {
  var m = MD().find(function (x) { return x.id === id; });
  if (!m) return;
  m.read = !m.read;
  renderMessages(); updateFolderCounts();
  await markReadDB(id, m.read);
}
async function delMsg(id) {
  var m = MD().find(function (x) { return x.id === id; });
  if (!m) return;
  if (!confirm('نقل الرسالة للمحذوفات؟')) return;
  m.deleted = true;
  renderMessages(); updateFolderCounts();
  var ok = await delDB(id);
  if (ok && typeof showToast === 'function') showToast('🗑️ اتنقلت للمحذوفات');
  else if (!ok) { m.deleted = false; renderMessages(); updateFolderCounts(); }
}
function replyTo(id) {
  openMessageX(id);
  setTimeout(function () {
    var box = document.getElementById('msg-reply-box');
    if (box) { box.style.display = 'block'; }
    var rb = document.getElementById('reply-body'); if (rb) rb.focus();
  }, 60);
}

/* ══════════ شريط الأدوات: زر «غير المقروءة» ══════════ */
function buildChip() {
  if (document.getElementById('mx-unread-chip')) return;
  var left = document.querySelector('#page-messages .msg-toolbar-left');
  if (!left) return;
  var b = document.createElement('button');
  b.className = 'mx-chip'; b.id = 'mx-unread-chip'; b.type = 'button';
  b.textContent = 'غير المقروءة';
  b.addEventListener('click', function () {
    UNREAD_ONLY = !UNREAD_ONLY;
    b.classList.toggle('on', UNREAD_ONLY);
    renderMessages();
  });
  left.insertBefore(b, left.firstChild);
}

/* ══════════ Realtime ══════════ */
function mapRow(m, myId) {
  return {
    id: m.id,
    subject: m.subject || '(بدون موضوع)',
    body: m.body || '',
    sender_id: String(m.sender_id || ''),
    sender_name: m.sender_name || (typeof getMsgUserName === 'function' ? getMsgUserName(m.sender_id) : '') || 'مجهول',
    sender_role: m.sender_role || (typeof getMsgUserRole === 'function' ? getMsgUserRole(m.sender_id) : '') || 'admin',
    to_id: String(m.to_id || ''),
    to_name: m.to_name || (typeof getMsgUserName === 'function' ? getMsgUserName(m.to_id) : '') || 'غير محدد',
    to_role: m.to_role || (typeof getMsgUserRole === 'function' ? getMsgUserRole(m.to_id) : '') || 'admin',
    read: m.is_read || false,
    starred: m.starred || false,
    urgent: m.urgent || false,
    draft: m.is_draft || false,
    deleted: m.deleted || false,
    created_at: m.created_at,
    is_mine: String(m.sender_id) === String(myId)
  };
}
function startRT() {
  var myId = String(myUser().id || '');
  if (!myId || typeof db === 'undefined') return;
  try {
    if (RT) { try { db.removeChannel(RT); } catch (e) {} RT = null; }
    RT = db.channel('mx_' + myId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'to_id=eq.' + myId },
        function (p) {
          var row = p['new'];
          if (!row || row.is_draft || row.deleted) return;
          var D = MD();
          if (D.some(function (x) { return x.id === row.id; })) return;
          D.unshift(mapRow(row, myId));
          renderMessages(); updateFolderCounts();
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: 'to_id=eq.' + myId },
        function (p) {
          var row = p['new']; if (!row) return;
          var m = MD().find(function (x) { return x.id === row.id; });
          if (!m) return;
          m.read = !!row.is_read; m.starred = !!row.starred; m.deleted = !!row.deleted;
          renderMessages(); updateFolderCounts();
        })
      .subscribe();
  } catch (e) { /* Realtime مش مفعّل — التحديث اليدوي شغال */ }
}

/* ══════════ الإقلاع ══════════ */
function boot() {
  if (BOOTED) return;
  if (!document.getElementById('page-messages')) return;
  BOOTED = true;
  injectCSS();
  buildChip();

  /* استبدال دوال العرض الأصلية */
  window.renderMessages = renderMessages;
  window.getFilteredMessages = getFilteredMessagesX;
  window.updateFolderCounts = updateFolderCounts;
  window.switchFolder = switchFolderX;
  window.openMessage = openMessageX;
  window.renderMsgListLoading = function () {
    var b = document.getElementById('msg-list-body');
    if (b) b.innerHTML = skeleton();
  };
  window.formatMsgTime = tAgo;
  window.toggleStar = function (id, e) {
    if (e) e.stopPropagation();
    var m = MD().find(function (x) { return x.id === id; });
    if (!m) return;
    m.starred = !m.starred;
    renderMessages(); updateFolderCounts();
    if (OPENID() === id) {
      var sb = document.getElementById('detail-star-btn');
      if (sb) sb.style.color = m.starred ? 'var(--gold)' : 'var(--mid)';
      var ss = document.getElementById('detail-star-svg');
      if (ss) ss.setAttribute('fill', m.starred ? '#c8920a' : 'none');
    }
    starDB(id, m.starred);
  };
  window.markMsgReadInDB = function (id) { return markReadDB(id, true); };
  window.updateMsgStarInDB = function (id, s) { return starDB(id, s); };
  window.deleteMsgInDB = function (id) { return delDB(id); };

  if (MD().length) { renderMessages(); updateFolderCounts(); }
  startRT();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
setTimeout(boot, 800);

/* ══════════ واجهة عامة ══════════ */
window.MsgUI = {
  render: renderMessages, counts: updateFolderCounts,
  toggleRead: toggleRead, del: delMsg, reply: replyTo,
  unreadOnly: function (v) { UNREAD_ONLY = !!v; renderMessages(); },
  boot: boot
};
})();
