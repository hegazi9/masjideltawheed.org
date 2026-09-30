-- ════════════════════════════════════════════════════════════════════
-- مدرسة التوحيد القرآنية — دفعة ١٢
--   • نطاق المشرف بالشُّعب (users.admin_scope للمشرف = branch_ids) — أكتر من مشرف على نفس الشعبة
--   • المشرف يضيف/يعدّل/ينقل/يوقف/يحذف المعلمين والطلاب في شعبه (RPC)
--   • إضافة معلم = حلقة تلقائية في شعبته (إصلاح «بيتضاف ومش بيظهر»)
--   • الطلاب المكفولين (students.is_sponsored)
--   • الدورة الخريفية بدون مراجعة (terms.settings.no_review)
-- آمن للتكرار. آخر استعلام = نتيجة الفحص.
-- ════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- (١) نطاق المشرف
-- ─────────────────────────────────────────────
create or replace function public.my_sv_branch_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $fn$
  select distinct x::uuid
    from public.users u, unnest(string_to_array(replace(coalesce(u.admin_scope,''),' ',''), ',')) x
   where u.auth_id = auth.uid() and u.role = 'supervisor' and coalesce(u.is_active,true)
     and x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$fn$;

create or replace function public.my_supervised_circle_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $fn$
  select id from public.circles
   where supervisor_id = public.my_uid()
      or branch_id in (select public.my_sv_branch_ids())
$fn$;

create or replace function public.can_manage_student(p_student uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_role text := public.my_role(); v_uid text := public.my_uid()::text; v_ok boolean := false;
begin
  if v_role = 'admin' then return true; end if;
  if v_uid is null then return false; end if;
  select true into v_ok
    from students s left join circles c on c.id::text = s.circle_id::text
   where s.id::text = p_student::text
     and ( (v_role = 'teacher'    and (c.teacher_id::text = v_uid or s.teacher_id::text = v_uid))
        or (v_role = 'supervisor' and (c.id in (select public.my_supervised_circle_ids()) or c.teacher_id::text = v_uid)) )
   limit 1;
  return coalesce(v_ok,false);
end $fn$;

-- المشرف يدير المعلم لو شعبته أو حلقته في نطاقه
create or replace function public.staff_can_manage(p_user uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_role text := public.my_role(); r record;
begin
  if v_role = 'admin' then return true; end if;
  if v_role is distinct from 'supervisor' then return false; end if;
  select role, branch_id into r from public.users where id = p_user;
  if not found or r.role <> 'teacher' then return false; end if;
  return (r.branch_id in (select public.my_sv_branch_ids()))
      or exists (select 1 from public.circles c where c.teacher_id = p_user and c.id in (select public.my_supervised_circle_ids()));
end $fn$;

-- ─────────────────────────────────────────────
-- (٢) إنشاء حساب طاقم (داخلية — من غير فحص دور) + حلقة تلقائية للمعلم
-- ─────────────────────────────────────────────
create or replace function public._staff_create_core(p_name text, p_role text, p_password text, p_phone text, p_branch_id uuid,
  p_dob date, p_level text, p_supervisor_id uuid, p_email text, p_gender text, p_extra jsonb, p_scope text)
returns json language plpgsql security definer set search_path to 'public','auth','extensions' as $fn$
declare
  v_uid uuid := gen_random_uuid(); v_user text; v_login text; v_i int := 1; v_id uuid; v_cid uuid := null;
  v_name text := btrim(regexp_replace(coalesce(p_name,''), '[<>"''`&\\]', '', 'g'));
  v_bname text; v_sched jsonb; v_gender text;
begin
  if v_name = '' then raise exception 'اكتب اسم المستخدم الكامل'; end if;
  if p_role not in ('teacher','supervisor','admin') then raise exception 'الدور لازم يكون معلم أو مشرف أو مدير'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'كلمة المرور لازم ٦ حروف على الأقل'; end if;

  v_user := lower(regexp_replace(translate(split_part(v_name,' ',1),
              'اأإآبتثجحخدذرزسشصضطظعغفقكلمنهويىةؤئ',
              'aaaabttghkdzrzsssdtzagfkklmnhwyaawy'), '[^a-z0-9]', '', 'g'));
  if v_user = '' then v_user := 'user'; end if;
  v_login := 'm-' || v_user || '@tawheed.edu';
  while exists (select 1 from auth.users where email = v_login) or exists (select 1 from public.users where username = v_login) loop
    v_i := v_i + 1; v_login := 'm-' || v_user || v_i || '@tawheed.edu';
  end loop;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_login, crypt(p_password, gen_salt('bf')),
          now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v_name), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_uid, v_uid::text, jsonb_build_object('sub', v_uid::text, 'email', v_login), 'email', now(), now(), now());

  insert into public.users (auth_id, full_name, role, username, phone, branch_id, dob, level, supervisor_id, email, gender,
                            address, education, licenses, job_title, marital, id_type, id_number, admin_scope, is_active)
  values (v_uid, v_name, p_role, v_login, nullif(btrim(coalesce(p_phone,'')),''), p_branch_id, p_dob, nullif(btrim(coalesce(p_level,'')),''),
          case when p_role = 'teacher' then p_supervisor_id else null end,
          nullif(btrim(coalesce(p_email,'')),''), nullif(btrim(coalesce(p_gender,'')),''),
          nullif(p_extra->>'address',''), nullif(p_extra->>'education',''), nullif(p_extra->>'licenses',''),
          nullif(p_extra->>'job_title',''), nullif(p_extra->>'marital',''), nullif(p_extra->>'id_type',''), nullif(p_extra->>'id_number',''),
          case when p_role = 'supervisor' then nullif(btrim(coalesce(p_scope,'')),'') else null end, true)
  returning id into v_id;

  -- ★ المعلم الجديد = حلقة جديدة في شعبته (من غيرها مابيظهرش ومايتضافلوش طلاب)
  if p_role = 'teacher' and p_branch_id is not null then
    select name, gender into v_bname, v_gender from public.branches where id = p_branch_id;
    select schedule into v_sched from public.circles where branch_id = p_branch_id and schedule is not null order by created_at limit 1;
    insert into public.circles (name, name_ar, branch_id, teacher_id, teachers, supervisor_id, is_active, gender, schedule)
    values ('حلقة ' || v_name || coalesce(' - ' || v_bname, ''), 'حلقة ' || v_name || coalesce(' - ' || v_bname, ''),
            p_branch_id, v_id, array[v_id::text], p_supervisor_id, true, v_gender, v_sched)
    returning id into v_cid;
  end if;

  return json_build_object('id', v_id, 'username', v_login, 'full_name', v_name, 'circle_id', v_cid);
end $fn$;
revoke execute on function public._staff_create_core(text,text,text,text,uuid,date,text,uuid,text,text,jsonb,text) from public, anon, authenticated;

-- المشرف الافتراضي لشعبة (أكتر مشرف عنده حلقات فيها، أو مشرف الشعبة من نطاقه)
create or replace function public._branch_default_supervisor(p_branch uuid)
returns uuid language sql stable security definer set search_path to 'public' as $fn$
  select coalesce(
    (select c.supervisor_id from public.circles c join public.users u on u.id = c.supervisor_id and u.role = 'supervisor' and coalesce(u.is_active,true)
      where c.branch_id = p_branch and coalesce(c.is_active,true) group by c.supervisor_id order by count(*) desc limit 1),
    (select u.id from public.users u where u.role = 'supervisor' and coalesce(u.is_active,true)
      and p_branch::text = any(string_to_array(replace(coalesce(u.admin_scope,''),' ',''), ',')) order by u.created_at limit 1))
$fn$;
revoke execute on function public._branch_default_supervisor(uuid) from public, anon, authenticated;

create or replace function public.admin_create_staff(p_name text, p_role text, p_password text, p_phone text default null,
  p_branch_id uuid default null, p_dob date default null, p_level text default null, p_supervisor_id uuid default null,
  p_email text default null, p_gender text default null, p_extra jsonb default '{}'::jsonb)
returns json language plpgsql security definer set search_path to 'public','auth','extensions' as $fn$
declare v_role text := public.my_role(); v_sup uuid := p_supervisor_id;
begin
  if v_role = 'admin' then
    null;
  elsif v_role = 'supervisor' then
    if p_role is distinct from 'teacher' then raise exception 'المشرف يضيف معلمين بس'; end if;
    if p_branch_id is null or p_branch_id not in (select public.my_sv_branch_ids()) then raise exception 'اختار شعبة من شعبك'; end if;
    if v_sup is null or not exists (select 1 from public.users where id = v_sup and role = 'supervisor') then v_sup := public.my_uid(); end if;
  else
    raise exception 'غير مصرح';
  end if;
  if p_role = 'teacher' and p_branch_id is null then raise exception 'اختار الشعبة'; end if;
  if p_role = 'teacher' and v_sup is null then v_sup := public._branch_default_supervisor(p_branch_id); end if;
  return public._staff_create_core(p_name, p_role, p_password, p_phone, p_branch_id, p_dob, p_level, v_sup, p_email, p_gender,
                                   coalesce(p_extra,'{}'::jsonb), coalesce(p_extra,'{}'::jsonb)->>'sv_scope');
end $fn$;

-- ─────────────────────────────────────────────
-- (٣) تعديل بيانات معلم/مشرف + نقل الشعبة + إيقاف/تفعيل
-- ─────────────────────────────────────────────
create or replace function public.staff_update(p_user uuid, p_data jsonb)
returns json language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_role text := public.my_role(); r public.users%rowtype; d jsonb := coalesce(p_data,'{}'::jsonb);
  v_branch uuid; v_sup uuid; v_name text; v_bname text; v_nc int; v_moved int := 0; n int;
begin
  if not public.staff_can_manage(p_user) then raise exception 'غير مصرح — المعلم مش في شعبك'; end if;
  select * into r from public.users where id = p_user;
  if not found then raise exception 'الحساب مش موجود'; end if;
  if r.role not in ('teacher','supervisor') then raise exception 'الحساب ده مش معلم/مشرف'; end if;
  if r.id = public.my_uid() and d ? 'is_active' and not (d->>'is_active')::boolean then raise exception 'مش هتقدر توقف نفسك'; end if;

  v_branch := case when d ? 'branch_id' then nullif(d->>'branch_id','')::uuid else r.branch_id end;
  if v_role = 'supervisor' and v_branch is distinct from r.branch_id and (v_branch is null or v_branch not in (select public.my_sv_branch_ids())) then
    raise exception 'الشعبة دي مش في نطاقك';
  end if;
  v_sup := case when v_role = 'admin' and d ? 'supervisor_id' then nullif(d->>'supervisor_id','')::uuid else r.supervisor_id end;
  v_name := nullif(btrim(regexp_replace(coalesce(d->>'full_name',''), '[<>"''`&\\]', '', 'g')), '');

  update public.users set
    full_name  = coalesce(v_name, full_name),
    phone      = case when d ? 'phone'     then nullif(btrim(d->>'phone'),'')     else phone end,
    email      = case when d ? 'email'     then nullif(btrim(d->>'email'),'')     else email end,
    gender     = case when d ? 'gender'    then nullif(btrim(d->>'gender'),'')    else gender end,
    dob        = case when d ? 'dob'       then nullif(d->>'dob','')::date        else dob end,
    level      = case when d ? 'level'     then nullif(btrim(d->>'level'),'')     else level end,
    address    = case when d ? 'address'   then nullif(btrim(d->>'address'),'')   else address end,
    education  = case when d ? 'education' then nullif(btrim(d->>'education'),'') else education end,
    licenses   = case when d ? 'licenses'  then nullif(btrim(d->>'licenses'),'')  else licenses end,
    job_title  = case when d ? 'job_title' then nullif(btrim(d->>'job_title'),'') else job_title end,
    marital    = case when d ? 'marital'   then nullif(btrim(d->>'marital'),'')   else marital end,
    id_type    = case when d ? 'id_type'   then nullif(btrim(d->>'id_type'),'')   else id_type end,
    id_number  = case when d ? 'id_number' then nullif(btrim(d->>'id_number'),'') else id_number end,
    is_active  = case when d ? 'is_active' then (d->>'is_active')::boolean        else is_active end,
    branch_id  = v_branch,
    supervisor_id = case when role = 'teacher' then v_sup else supervisor_id end,
    admin_scope   = case when role = 'supervisor' and v_role = 'admin' and d ? 'sv_scope' then nullif(btrim(d->>'sv_scope'),'') else admin_scope end
  where id = p_user;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'لم يُحفظ'; end if;

  -- نقل المعلم لشعبة تانية = نقل حلقته وطلابها
  if r.role = 'teacher' and v_branch is not null and v_branch is distinct from r.branch_id then
    select count(*) into v_nc from public.circles where teacher_id = p_user and coalesce(is_active,true);
    select name into v_bname from public.branches where id = v_branch;
    if v_nc = 1 or r.branch_id is not null then
      with m as (
        update public.circles c set branch_id = v_branch,
               name = 'حلقة ' || coalesce(v_name, r.full_name) || ' - ' || v_bname,
               name_ar = 'حلقة ' || coalesce(v_name, r.full_name) || ' - ' || v_bname
         where c.teacher_id = p_user and coalesce(c.is_active,true)
           and (v_nc = 1 or c.branch_id = r.branch_id)
        returning c.id)
      select count(*) into v_moved from m;
      update public.students set branch_id = v_branch
       where circle_id in (select id from public.circles where teacher_id = p_user and branch_id = v_branch);
    end if;
  end if;
  -- اسم المعلم اتغيّر → اسم حلقته (الحلقات اللي اسمها «حلقة <الاسم القديم>…»)
  if v_name is not null and v_name <> r.full_name then
    update public.circles set name = replace(name, r.full_name, v_name), name_ar = replace(coalesce(name_ar,name), r.full_name, v_name)
     where teacher_id = p_user and name like '%' || r.full_name || '%';
  end if;
  return json_build_object('ok', true, 'circles_moved', v_moved);
end $fn$;

-- ─────────────────────────────────────────────
-- (٤) الحذف النهائي: المشرف لمعلميه + الحلقات الفارغة بتاعته هو بس
-- ─────────────────────────────────────────────
create or replace function public.admin_delete_staff(p_user_id uuid, p_force boolean default false)
returns json language plpgsql security definer set search_path to 'public','auth' as $fn$
declare
  v_auth uuid; v_name text; v_role text; v_students int; v_cir int := 0; v_hist int := 0;
  v_att int; v_mem int; v_pts int; v_les int := 0; v_grp int := 0; v_blockers text := ''; n int; v_cids uuid[];
begin
  if not public.staff_can_manage(p_user_id) then raise exception 'غير مصرح'; end if;
  if p_user_id = public.my_uid() then raise exception 'مش هتقدر تحذف نفسك'; end if;
  select auth_id, full_name, role into v_auth, v_name, v_role from public.users where id = p_user_id;
  if not found then raise exception 'المستخدم مش موجود'; end if;
  if v_role not in ('teacher','supervisor') then raise exception 'الحذف هنا للمعلمين والمشرفين بس'; end if;

  select coalesce(array_agg(id), '{}') into v_cids from public.circles where teacher_id = p_user_id;
  select count(*) into v_students from public.students s where s.circle_id = any(v_cids) and coalesce(s.is_active,true);
  if v_students > 0 then raise exception 'له حلقة بها % طالب — انقلهم لمعلم آخر الأول', v_students; end if;

  select count(*) into v_att from public.attendance   where recorded_by = p_user_id;
  select count(*) into v_mem from public.memorization where teacher_id  = p_user_id;
  select count(*) into v_pts from public.points_cards where given_by    = p_user_id;
  begin select count(*) into v_les from public.lessons where teacher_id = p_user_id; exception when undefined_table then v_les := 0; end;
  begin select count(*) into v_grp from public.group_dictation where teacher_id = p_user_id; exception when undefined_table then v_grp := 0; end;
  select v_hist + count(*) into v_hist from public.students s where s.circle_id = any(v_cids);   -- طلاب موقوفين/أرشيف
  v_hist := v_hist + v_att + v_mem + v_pts + v_les + v_grp;
  if v_hist > 0 and not p_force then
    if v_att > 0 then v_blockers := v_blockers || v_att || ' حضور • '; end if;
    if v_mem > 0 then v_blockers := v_blockers || v_mem || ' حفظ • '; end if;
    if v_pts > 0 then v_blockers := v_blockers || v_pts || ' بطاقة • '; end if;
    if v_les > 0 then v_blockers := v_blockers || v_les || ' درس • '; end if;
    if v_grp > 0 then v_blockers := v_blockers || v_grp || ' تلقين • '; end if;
    v_blockers := coalesce(nullif(rtrim(v_blockers, ' • '),''), 'طلاب في الأرشيف');
    raise exception 'المعلم ده له تاريخ شغل: %. الأفضل توقفه مؤقتاً بدل ما تحذفه — أو أكّد الحذف النهائي لو متأكد.', v_blockers;
  end if;

  update public.circles  set teacher_id = null where teacher_id = p_user_id;
  update public.circles  set supervisor_id = null where supervisor_id = p_user_id;
  update public.users    set supervisor_id = null where supervisor_id = p_user_id;
  update public.students set teacher_id = null where teacher_id = p_user_id;
  update public.attendance   set recorded_by = null where recorded_by = p_user_id;
  update public.memorization set teacher_id  = null where teacher_id  = p_user_id;
  update public.points_cards set given_by    = null where given_by    = p_user_id;
  begin update public.lessons          set teacher_id = null where teacher_id = p_user_id; exception when undefined_table then null; end;
  begin update public.group_dictation  set teacher_id = null where teacher_id = p_user_id; exception when undefined_table then null; end;
  begin update public.teacher_exams    set teacher_id = null where teacher_id = p_user_id; exception when undefined_table then null; end;
  begin update public.teacher_training set teacher_id = null where teacher_id = p_user_id; exception when undefined_table then null; end;
  begin update public.student_files    set last_updated_by = null where last_updated_by = p_user_id; exception when undefined_table then null; end;
  begin update public.announcements    set created_by = null where created_by = p_user_id; exception when undefined_table then null; end;
  begin update public.events           set created_by = null where created_by = p_user_id; exception when undefined_table then null; end;
  begin update public.points_usage     set approved_by = null where approved_by = p_user_id; exception when undefined_table then null; end;
  begin update public.lesson_preps     set reviewed_by = null where reviewed_by = p_user_id; exception when undefined_table then null; end;
  begin
    update public.financial_transactions set recorded_by  = null where recorded_by  = p_user_id;
    update public.financial_transactions set related_user = null where related_user = p_user_id;
  exception when undefined_table then null; end;
  begin delete from public.teacher_daily_tasks       where teacher_id = p_user_id; exception when undefined_table then null; end;
  begin delete from public.lesson_preps              where teacher_id = p_user_id; exception when undefined_table then null; end;
  begin delete from public.teacher_training_progress where teacher_id = p_user_id; exception when undefined_table then null; end;
  begin delete from public.messages where sender_id = p_user_id::text or to_id = p_user_id::text; exception when undefined_table then null; end;
  begin delete from public.weekly_alert_actions where taken_by = p_user_id; exception when undefined_table then null; end;

  -- حلقاته هو بس: الفاضية تتمسح، واللي ليها تاريخ تتقفل
  update public.circles set is_active = false where id = any(v_cids);
  begin
    delete from public.circles c where c.id = any(v_cids)
       and not exists (select 1 from public.students s where s.circle_id = c.id)
       and not exists (select 1 from public.attendance a where a.circle_id = c.id)
       and not exists (select 1 from public.memorization m where m.circle_id = c.id);
    get diagnostics v_cir = row_count;
  exception when foreign_key_violation then v_cir := 0; end;

  delete from public.users where id = p_user_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'الحذف فشل'; end if;
  if v_auth is not null then
    delete from auth.identities where user_id = v_auth;
    delete from auth.users      where id      = v_auth;
  end if;
  return json_build_object('deleted', true, 'name', v_name, 'circles_removed', v_cir, 'history_cleared', v_hist);
end $fn$;

-- ─────────────────────────────────────────────
-- (٥) كلمة المرور: المدير لأي حد (غير المديرين) — والمشرف لمعلميه
-- ─────────────────────────────────────────────
create or replace function public.admin_set_password(p_user_id uuid, p_password text)
returns json language plpgsql security definer set search_path to 'public','auth','extensions' as $fn$
declare v_auth uuid; v_name text; v_user text; v_role text;
begin
  if public.my_role() = 'admin' then null;
  elsif public.my_role() = 'supervisor' and public.staff_can_manage(p_user_id) then null;
  else raise exception 'غير مصرح'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'كلمة المرور لازم ٦ حروف على الأقل'; end if;
  select auth_id, full_name, username, role into v_auth, v_name, v_user, v_role from public.users where id = p_user_id;
  if not found then raise exception 'المستخدم مش موجود'; end if;
  if v_role = 'admin' then raise exception 'كلمة مرور المدير بتتغيّر من صاحبها بس (الإعدادات ← تغيير كلمة المرور)'; end if;
  if v_auth is null then raise exception 'المستخدم ده مالوش حساب دخول'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = v_auth;
  return json_build_object('ok', true, 'name', v_name, 'username', v_user);
end $fn$;

-- ─────────────────────────────────────────────
-- (٦) الطلاب: إضافة (نطاق الشعبة) + نقل لحلقة تانية
-- ─────────────────────────────────────────────
create or replace function public.add_student(p_full_name text, p_circle_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_role text := public.my_role(); v_circle record; v_user_id uuid; v_stu_id uuid;
  v_name text := btrim(regexp_replace(coalesce(p_full_name,''), '[<>"''`&\\]', '', 'g'));
begin
  if v_role not in ('admin','supervisor') then raise exception 'غير مسموح — الإضافة للمدير والمشرف فقط'; end if;
  if length(v_name) < 3 or array_length(regexp_split_to_array(v_name, '\s+'), 1) < 2 then raise exception 'اكتب اسم الطالب كامل'; end if;
  select id, teacher_id, branch_id, is_active into v_circle from circles where id::text = p_circle_id::text;
  if not found then raise exception 'الحلقة مش موجودة'; end if;
  if v_circle.teacher_id is null then raise exception 'الحلقة مالهاش معلّم مُسند'; end if;
  if v_circle.is_active is false then raise exception 'الحلقة دي متقفلة (أرشيف)'; end if;
  if v_role = 'supervisor' and p_circle_id not in (select public.my_supervised_circle_ids()) then raise exception 'الحلقة دي مش تحت إشرافك'; end if;
  insert into users (full_name, role, username, is_active)
  values (v_name, 'student', 'student_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10), true)
  returning id into v_user_id;
  insert into students (user_id, circle_id, teacher_id, branch_id, memorized_parts, is_active)
  values (v_user_id, p_circle_id, v_circle.teacher_id, v_circle.branch_id, 0, true)
  returning id into v_stu_id;
  return v_stu_id;
end $fn$;

create or replace function public.staff_move_student(p_student uuid, p_circle uuid)
returns json language plpgsql security definer set search_path to 'public' as $fn$
declare v_role text := public.my_role(); c record; n int;
begin
  if v_role not in ('admin','supervisor') or not public.can_manage_student(p_student) then raise exception 'غير مصرح — الطالب مش في شعبك'; end if;
  select id, teacher_id, branch_id, is_active into c from public.circles where id = p_circle;
  if not found then raise exception 'الحلقة مش موجودة'; end if;
  if c.is_active is false then raise exception 'الحلقة دي متقفلة (أرشيف)'; end if;
  if v_role = 'supervisor' and p_circle not in (select public.my_supervised_circle_ids()) then raise exception 'الحلقة دي مش في شعبك'; end if;
  update public.students set circle_id = c.id, teacher_id = c.teacher_id, branch_id = c.branch_id where id = p_student;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'لم يُحفظ'; end if;
  return json_build_object('ok', true);
end $fn$;


-- تعديل بيانات طالب (الاسم/الهاتف في users + الحفظ/الحالة/الملاحظات في students) — المدير والمشرف في نطاقه
create or replace function public.staff_update_student(p_student uuid, p_data jsonb)
returns json language plpgsql security definer set search_path to 'public' as $fn$
declare v_role text := public.my_role(); d jsonb := coalesce(p_data,'{}'::jsonb); v_uid uuid; v_name text; n int;
begin
  if v_role not in ('admin','supervisor') or not public.can_manage_student(p_student) then raise exception 'غير مصرح — الطالب مش في شعبك'; end if;
  select user_id into v_uid from public.students where id = p_student;
  if not found then raise exception 'الطالب مش موجود'; end if;
  v_name := nullif(btrim(regexp_replace(coalesce(d->>'full_name',''), '[<>"''`&\\]', '', 'g')), '');
  if v_uid is not null and (v_name is not null or d ? 'phone') then
    update public.users set full_name = coalesce(v_name, full_name),
           phone = case when d ? 'phone' then nullif(btrim(d->>'phone'),'') else phone end
     where id = v_uid and role = 'student';
  end if;
  update public.students set
    memorized_parts = case when d ? 'memorized_parts' then coalesce(nullif(d->>'memorized_parts','')::numeric, 0) else memorized_parts end,
    is_active       = case when d ? 'is_active' then (d->>'is_active')::boolean else is_active end,
    notes           = case when d ? 'notes' then nullif(btrim(d->>'notes'),'') else notes end
  where id = p_student;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'لم يُحفظ'; end if;
  return json_build_object('ok', true);
end $fn$;

-- ─────────────────────────────────────────────
-- (٧) الطلاب المكفولين (مابيظهروش «لم يدفع» في الماليات)
-- ─────────────────────────────────────────────
alter table public.students add column if not exists is_sponsored boolean not null default false;

create or replace function public.fin_set_sponsored(p_student uuid, p_on boolean)
returns json language plpgsql security definer set search_path to 'public' as $fn$
declare n int;
begin
  if coalesce(public.my_role(),'') not in ('admin','supervisor') or not public.can_manage_student(p_student) then raise exception 'غير مصرح'; end if;
  update public.students set is_sponsored = coalesce(p_on,false) where id = p_student;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'لم يُحفظ'; end if;
  return json_build_object('ok', true, 'is_sponsored', coalesce(p_on,false));
end $fn$;

-- ─────────────────────────────────────────────
-- (٨) الدورة الخريفية: مفيش مراجعة (لا خطة ولا تسميع)
-- ─────────────────────────────────────────────
update public.terms set settings = coalesce(settings,'{}'::jsonb) || '{"no_review":true}'::jsonb where code = 'autumn26';

-- ─────────────────────────────────────────────
-- صلاحيات الدوال
-- ─────────────────────────────────────────────
do $fn$
declare s text;
begin
  foreach s in array array[
    'public.my_sv_branch_ids()','public.my_supervised_circle_ids()','public.can_manage_student(uuid)','public.staff_can_manage(uuid)',
    'public.admin_create_staff(text,text,text,text,uuid,date,text,uuid,text,text,jsonb)','public.staff_update(uuid,jsonb)',
    'public.admin_delete_staff(uuid,boolean)','public.admin_set_password(uuid,text)','public.add_student(text,uuid)',
    'public.staff_move_student(uuid,uuid)','public.fin_set_sponsored(uuid,boolean)','public.staff_update_student(uuid,jsonb)']
  loop
    execute format('revoke execute on function %s from public, anon', s);
    execute format('grant execute on function %s to authenticated, service_role', s);
  end loop;
end $fn$;

-- ─────────────────────────────────────────────
-- فحص (نتيجة واحدة)
-- ─────────────────────────────────────────────
select json_build_object(
  'rpcs', (select count(*) from pg_proc where proname in ('my_sv_branch_ids','staff_can_manage','_staff_create_core','staff_update','staff_move_student','fin_set_sponsored','staff_update_student')),
  'is_sponsored_col', exists(select 1 from information_schema.columns where table_schema='public' and table_name='students' and column_name='is_sponsored'),
  'autumn_no_review', (select settings->>'no_review' from public.terms where code='autumn26'),
  'core_hidden', not has_function_privilege('authenticated','public._staff_create_core(text,text,text,text,uuid,date,text,uuid,text,text,jsonb,text)','execute')
) as "نتيجة_دفعة_١٢";
