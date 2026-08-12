alter table private.product_intake_payloads enable row level security;
alter table private.project_resource_bindings enable row level security;
alter table private.integration_secrets enable row level security;

revoke all on table private.product_intake_payloads from anon, authenticated;
revoke all on table private.project_resource_bindings from anon, authenticated;
revoke all on table private.integration_secrets from anon, authenticated;

grant select, insert, update, delete on table private.product_intake_payloads to service_role;
grant select, insert, update, delete on table private.project_resource_bindings to service_role;
grant select, insert, update, delete on table private.integration_secrets to service_role;

comment on table private.product_intake_payloads is 'Server-only product intake payload storage. RLS enabled with no client policies; service_role only.';
comment on table private.project_resource_bindings is 'Server-only canonical resource binding storage. RLS enabled with no client policies; service_role only.';
comment on table private.integration_secrets is 'Server-only integration secret references. RLS enabled with no client policies; service_role only.';
