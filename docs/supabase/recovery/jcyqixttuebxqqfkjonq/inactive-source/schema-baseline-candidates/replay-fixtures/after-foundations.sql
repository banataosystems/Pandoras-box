-- TEST-ONLY, INACTIVE REPLAY FIXTURE.
-- This supplies rows assumed by later historical migrations. It is not a
-- production seed and must never be placed under supabase/migrations.

insert into auth.users (id, raw_user_meta_data)
values (
  '76a3bf0a-5bfa-4ce2-b92a-3646824e5754'::uuid,
  jsonb_build_object()
);

insert into public.organizations (id, name, slug, status, created_by)
values (
  '2270b266-59da-4c39-bfd9-9f8d08352af0'::uuid,
  'Replay Organization',
  'replay-organization',
  'active',
  '76a3bf0a-5bfa-4ce2-b92a-3646824e5754'::uuid
);

insert into public.memberships (
  organization_id,
  user_id,
  role,
  status,
  joined_at
)
values (
  '2270b266-59da-4c39-bfd9-9f8d08352af0'::uuid,
  '76a3bf0a-5bfa-4ce2-b92a-3646824e5754'::uuid,
  'owner'::public.member_role,
  'active'::public.membership_status,
  now()
);
