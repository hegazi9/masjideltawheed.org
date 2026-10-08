-- ════════════════════════════════════════════════════════════════
-- دفعة ١٥ — تعديلات لوحة المشرف (٨ أكتوبر ٢٠٢٦)
-- آمن للتكرار • شغّله مرة واحدة في SQL Editor قبل رفع الملفات
--   (١) نقاط يدوية بسبب (إضافة / خصم) + إشعار لولي الأمر   ← student_point_adjustments + student_points_adjust
--   (٢) حالة الخطة: أتم / سبق / لم يتم                       ← memorization.plan_status (+ تصحيح الخريف)
--   (٣) مستوى التجويد التلقائي في الجدول الطلابي             ← students_sheet (+ tajweed_level)
-- ════════════════════════════════════════════════════════════════

-- ═══════════ (١) النقاط اليدوية ═══════════
create table if not exists public.student_point_adjustments(
  id            bigserial primary key,
  student_id    uuid not null references public.students(id) on delete cascade,
  points        integer not null check (points <> 0 and points between -1000 and 1000),
  reason        text not null check (char_length(btrim(reason)) between 2 and 300),
  by_id         uuid,
  by_name       text,
  by_role       text,
  balance_after integer,
  created_at    timestamptz not null default now()
);
create index if not exists spa_student_idx on public.student_point_adjustments(student_id, created_at desc);

alter table public.student_point_adjustments enable row level security;
revoke all on public.student_point_adjustments from anon;
revoke all on public.student_point_adjustments from public;
grant select on public.student_point_adjustments to authenticated;

drop policy if exists spa_staff_sel on public.student_point_adjustments;
create policy spa_staff_sel on public.student_point_adjustments for select to authenticated
  using (public.can_manage_student(student_id));
drop policy if exists par_sel on public.student_point_adjustments;
create policy par_sel on public.student_point_adjustments for select to authenticated
  using (student_id in (select public.my_child_ids()));
-- القفل العام (نفس باقي الجداول) — الكتابة عبر RPC بس
drop policy if exists zz_act on public.student_point_adjustments;
create policy zz_act on public.student_point_adjustments as restrictive for all to authenticated
  using ((select public.am_active())) with check ((select public.am_active()));
drop policy if exists zz_par_ins on public.student_point_adjustments;
create policy zz_par_ins on public.student_point_adjustments as restrictive for insert to authenticated
  with check (public.my_role() is distinct from 'parent');
drop policy if exists zz_par_upd on public.student_point_adjustments;
create policy zz_par_upd on public.student_point_adjustments as restrictive for update to authenticated
  using (public.my_role() is distinct from 'parent') with check (public.my_role() is distinct from 'parent');
drop policy if exists zz_par_del on public.student_point_adjustments;
create policy zz_par_del on public.student_point_adjustments as restrictive for delete to authenticated
  using (public.my_role() is distinct from 'parent');
drop policy if exists zz_emp_ins on public.student_point_adjustments;
create policy zz_emp_ins on public.student_point_adjustments as restrictive for insert to authenticated
  with check (public.my_role() is distinct from 'employee');
drop policy if exists zz_emp_upd on public.student_point_adjustments;
create policy zz_emp_upd on public.student_point_adjustments as restrictive for update to authenticated
  using (public.my_role() is distinct from 'employee') with check (public.my_role() is distinct from 'employee');
drop policy if exists zz_emp_del on public.student_point_adjustments;
create policy zz_emp_del on public.student_point_adjustments as restrictive for delete to authenticated
  using (public.my_role() is distinct from 'employee');

-- حارس: السجل مايتعدّلش + اسم المسجِّل من القاعدة (ممنوع التزوير)
create or replace function public.trg_spa_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if tg_op = 'UPDATE' then raise exception 'سجل النقاط مايتعدّلش — سجّل حركة عكسية'; end if;
  if public.my_uid() is not null then
    new.by_id := public.my_uid();
    select full_name, role into new.by_name, new.by_role from public.users where id = public.my_uid();
  end if;
  new.created_at := now();
  return new;
end $fn$;
drop trigger if exists trg_spa_guard on public.student_point_adjustments;
create trigger trg_spa_guard before insert or update on public.student_point_adjustments
  for each row execute function public.trg_spa_guard();

-- الرصيد: students.total_points بيتحدّث بالفرق (زي prayer_points)
create or replace function public.trg_spa_delta() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
declare v int;
begin
  v := case when tg_op = 'DELETE' then -coalesce(old.points,0) else coalesce(new.points,0) end;
  if v <> 0 then
    update public.students set total_points = greatest(0, coalesce(total_points,0) + v)
     where id = (case when tg_op = 'DELETE' then old.student_id else new.student_id end);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $fn$;
drop trigger if exists trg_spa_delta on public.student_point_adjustments;
create trigger trg_spa_delta after insert or delete on public.student_point_adjustments
  for each row execute function public.trg_spa_delta();

-- RPC: إضافة (+) أو خصم (−) نقاط بسبب — المدير أو مشرف الطالب — وإشعار لكل أولياء أموره
create or replace function public.student_points_adjust(p_student uuid, p_points integer, p_reason text)
returns json language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_role text := public.my_role(); v_uid uuid := public.my_uid();
  v_cur int; v_new int; v_reason text; v_id bigint; v_name text; v_me text; v_first text; n int := 0; r record;
begin
  if v_role is null or v_role not in ('admin','supervisor') then raise exception 'غير مصرح'; end if;
  if not public.can_manage_student(p_student) then raise exception 'غير مصرح — الطالب مش في شعبك'; end if;
  if p_points is null or p_points = 0 or abs(p_points) > 1000 then raise exception 'عدد النقاط من ١ لـ ١٠٠٠'; end if;
  v_reason := btrim(regexp_replace(regexp_replace(coalesce(p_reason,''), '[<>"''`&\\]', '', 'g'), '\s+', ' ', 'g'));
  if char_length(v_reason) < 2 then raise exception 'اكتب السبب'; end if;
  v_reason := left(v_reason, 300);
  select s.total_points, u.full_name into v_cur, v_name
    from public.students s left join public.users u on u.id = s.user_id
   where s.id = p_student for update of s;
  if not found then raise exception 'الطالب مش موجود'; end if;
  v_cur := coalesce(v_cur, 0);
  if p_points < 0 and v_cur + p_points < 0 then
    raise exception 'رصيد الطالب % نقطة بس — مينفعش تخصم أكتر منه', v_cur;
  end if;
  v_new := v_cur + p_points;
  insert into public.student_point_adjustments(student_id, points, reason, balance_after)
  values (p_student, p_points, v_reason, v_new) returning id into v_id;
  select full_name into v_me from public.users where id = v_uid;
  v_first := split_part(btrim(coalesce(v_name,'')), ' ', 1);
  for r in select ps.parent_id
             from public.parent_students ps
             join public.users p on p.id = ps.parent_id and p.role = 'parent' and coalesce(p.is_active, true)
            where ps.student_id = p_student loop
    insert into public.notifications(user_id, actor_id, actor_name, type, title, body, link, ref_id, meta)
    values (r.parent_id, v_uid, coalesce(v_me, 'الإدارة'),
            case when p_points > 0 then 'points_add' else 'points_remove' end,
            case when p_points > 0 then '⭐ إضافة ' || abs(p_points) || ' نقطة لـ ' || v_first
                 else '➖ خصم ' || abs(p_points) || ' نقطة من ' || v_first end,
            'السبب: ' || v_reason || ' • الرصيد بعدها: ' || v_new || ' نقطة',
            'points', 'spa_' || v_id,
            jsonb_build_object('student_id', p_student, 'points', p_points, 'reason', v_reason, 'balance', v_new))
    on conflict do nothing;
    n := n + 1;
  end loop;
  return json_build_object('ok', true, 'id', v_id, 'balance', v_new, 'notified', n);
end $fn$;
revoke all on function public.student_points_adjust(uuid, integer, text) from public;
revoke all on function public.student_points_adjust(uuid, integer, text) from anon;
grant execute on function public.student_points_adjust(uuid, integer, text) to authenticated, service_role;

-- ═══════════ (٢) حالة الخطة: done = أتم • ahead = سبق • behind = لم يتم ═══════════
alter table public.memorization add column if not exists plan_status text;
alter table public.memorization drop constraint if exists memorization_plan_status_chk;
alter table public.memorization add constraint memorization_plan_status_chk
  check (plan_status is null or plan_status in ('done','ahead','behind'));

-- مواضع الآيات (نفس spPos في الواجهة) — للتصحيح بأثر رجعي
create or replace function public._sp_surah_no(p text) returns int language sql immutable as $fn$
  select case when btrim(coalesce(p,'')) ~ '^[0-9]+$' then btrim(p)::int
              else array_position(array['الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس','هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه','الأنبياء','الحج','المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم','لقمان','السجدة','الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر','فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق','الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة','الحشر','الممتحنة','الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة','المعارج','نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس','التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر','البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة','العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون','النصر','المسد','الإخلاص','الفلق','الناس'], btrim(coalesce(p,''))) end
$fn$;
create or replace function public._sp_pos(p_dir text, p_s int, p_a int) returns int language plpgsql immutable as $fn$
declare c int[] := array[7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6]; s int := p_s; a int; acc int := 0; i int;
begin
  if s is null or s < 1 or s > 114 then return null; end if;
  a := greatest(1, least(coalesce(p_a,1), c[s]));
  if p_dir = 'backward' then
    for i in s+1..114 loop acc := acc + c[i]; end loop;
  else
    for i in 1..s-1 loop acc := acc + c[i]; end loop;
  end if;
  return acc + a;
end $fn$;

revoke all on function public._sp_surah_no(text) from public;
revoke all on function public._sp_surah_no(text) from anon;
revoke all on function public._sp_pos(text, int, int) from public;
revoke all on function public._sp_pos(text, int, int) from anon;

-- تصحيح الدورات الجديدة (من غير الصيفي): «سبق الخطة» كان بيتكتب «لم يتم»
-- القاعدة: آخر آية وصلها الطالب لحد يوم الحلقة مقارنةً بهدف اليوم في الخطة
with base as (
  select m.id, m.student_id, m.type, m.date, m.grade, p.id plan_id, p.direction,
         (select x->(case when m.type = 'new' then 'h' else 'r' end)
            from jsonb_array_elements(coalesce(p.data->'sessions','[]'::jsonb)) x
           where x->>'date' = m.date::text limit 1) tgt,
         greatest(
           public._sp_pos(p.direction, public._sp_surah_no(m.surah_from), m.ayah_from),
           public._sp_pos(p.direction, public._sp_surah_no(coalesce(nullif(m.surah_to,''), m.surah_from)), coalesce(m.ayah_to, m.ayah_from))
         ) endp
    from public.memorization m
    join public.student_plans p on p.student_id = m.student_id and m.date between p.period_from and p.period_to
    join public.terms t on t.id = p.term_id and coalesce((t.settings->>'legacy')::boolean, false) = false
), reach as (
  select b.*, max(case when b.grade is distinct from 'retry' then b.endp end)
           over (partition by b.plan_id, b.type order by b.date range between unbounded preceding and current row) reach_p
    from base b
), calc as (
  select r.id,
         case when r.grade = 'retry' then 'behind'
              when r.reach_p is null then 'behind'
              when r.reach_p > public._sp_pos(r.direction, (r.tgt->>'s')::int, (r.tgt->>'a')::int) then 'ahead'
              when r.reach_p = public._sp_pos(r.direction, (r.tgt->>'s')::int, (r.tgt->>'a')::int) then 'done'
              else 'behind' end st
    from reach r
   where r.tgt is not null and jsonb_typeof(r.tgt) = 'object' and (r.tgt->>'s') is not null
)
update public.memorization m
   set plan_status = c.st,
       plan_done   = (c.st <> 'behind')
  from calc c
 where m.id = c.id
   and (m.plan_status is distinct from c.st or m.plan_done is distinct from (c.st <> 'behind'));

-- ═══════════ (٣) الجدول الطلابي: مستوى التجويد تلقائي من ملف الطالب ═══════════
-- أعلى مستوى (من السبعة) اتقيّم فيه الطالب في تبويب «التجويد»
create or replace function public.tajweed_level_no(p_tj jsonb) returns int language sql immutable as $fn$
  select max(case
    when k in ('izhar','idgham_g','idgham_ng','iqlab','ikhfa') then 1
    when k in ('ikhfa_shaf','idgham_mim','izhar_shaf') then 2
    when k in ('mad_tab','mad_waj','mad_jaiz','mad_badal') then 3
    when k in ('mak_jawf','mak_halq','mak_lath','mak_shaf') then 4
    when k in ('sif_laz','sif_arid','sif_hams','sif_rakh') then 5
    when k in ('waqf_tam','waqf_kaf','waqf_has') then 6
    when k in ('taf_tar','ahkam_ra','ahkam_lam') then 7 end)
  from jsonb_each_text(case when jsonb_typeof(p_tj) = 'object' then p_tj else '{}'::jsonb end) e(k, v)
  where btrim(coalesce(v,'')) <> ''
$fn$;

revoke all on function public.tajweed_level_no(jsonb) from public;
revoke all on function public.tajweed_level_no(jsonb) from anon;
grant execute on function public.tajweed_level_no(jsonb) to authenticated, service_role;

drop function if exists public.students_sheet(uuid[]);
create function public.students_sheet(p_ids uuid[])
returns table(id uuid, full_name text, phone text, date_of_birth date, memorized_parts numeric, total_points integer,
              is_active boolean, notes text, dad text, mom text, level text, addr text, dad_edu text, mom_edu text,
              parent_phone text, tajweed_level_no integer, tajweed_level text)
language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_role text := public.my_role();
begin
  if v_role is null or v_role not in ('admin','supervisor','employee','teacher') then raise exception 'غير مصرح'; end if;
  return query
  select s.id, u.full_name, u.phone, coalesce(s.date_of_birth, nullif(f.data->>'dob','')::date), s.memorized_parts, s.total_points,
         s.is_active, s.notes, nullif(f.data->>'dad',''), nullif(f.data->>'mom',''), nullif(f.data->>'level',''),
         nullif(f.data->>'addr',''), nullif(f.data->>'dadEdu',''), nullif(f.data->>'momEdu',''),
         (select p.phone from public.parent_students ps join public.users p on p.id = ps.parent_id
           where ps.student_id = s.id and coalesce(p.is_active,true) and p.phone is not null limit 1),
         public.tajweed_level_no(f.data->'tajweed'),
         (array['المستوى الأول','المستوى الثاني','المستوى الثالث','المستوى الرابع','المستوى الخامس','المستوى السادس','المستوى السابع'])[public.tajweed_level_no(f.data->'tajweed')]
    from public.students s
    left join public.users u on u.id = s.user_id
    left join public.student_files f on f.student_id = s.id
   where s.id = any(p_ids)
     and (v_role in ('admin','employee') or public.can_manage_student(s.id));
end $fn$;
revoke all on function public.students_sheet(uuid[]) from public;
revoke all on function public.students_sheet(uuid[]) from anon;
grant execute on function public.students_sheet(uuid[]) to authenticated, service_role;

-- ═══════════ فحص (نتيجة واحدة) ═══════════
select json_build_object(
  'جدول النقاط اليدوية', (select count(*) from pg_tables where schemaname='public' and tablename='student_point_adjustments'),
  'سياسات الجدول',       (select count(*) from pg_policies where tablename='student_point_adjustments'),
  'تريجرات الجدول',      (select count(*) from pg_trigger where tgrelid='public.student_point_adjustments'::regclass and not tgisinternal),
  'RPC النقاط',          (select count(*) from pg_proc where proname='student_points_adjust'),
  'عمود حالة الخطة',     (select count(*) from information_schema.columns where table_name='memorization' and column_name='plan_status'),
  'حالات الخطة (الخريف)', (select json_object_agg(coalesce(plan_status,'—'), n) from (select plan_status, count(*) n from public.memorization where date >= '2026-10-02' group by 1) z),
  'طلاب ليهم مستوى تجويد', (select count(*) from public.student_files where public.tajweed_level_no(data->'tajweed') is not null),
  'students_sheet أعمدة', (select pronargs || ' / ' || array_length(proallargtypes,1) from pg_proc where proname='students_sheet')
) as "نتيجة دفعة ١٥";
