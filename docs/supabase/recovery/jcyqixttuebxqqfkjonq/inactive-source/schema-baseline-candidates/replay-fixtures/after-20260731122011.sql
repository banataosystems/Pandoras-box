-- TEST-ONLY, INACTIVE REPLAY FIXTURE.
-- Apply only after 20260731122011_projectos_product_intelligence_schema.
-- The later FXPass growth-contract migration assumes this registry row exists.

insert into private.projectos_product_registry (
  organization_id,
  product_key,
  title,
  repo_full_name,
  data_classification
)
values (
  '2270b266-59da-4c39-bfd9-9f8d08352af0'::uuid,
  'fxpass',
  'FXPass',
  'banataosystems/fxpass',
  'pseudonymous_product'
);
