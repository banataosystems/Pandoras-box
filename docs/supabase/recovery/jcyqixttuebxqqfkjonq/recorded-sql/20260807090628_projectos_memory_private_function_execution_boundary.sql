begin;

revoke all on function private.execution_learning_signature_basis(jsonb) from public, anon, authenticated;
revoke all on function private.enforce_execution_plan_memory_context() from public, anon, authenticated;
revoke all on function private.dispatch_execution_learning(uuid) from public, anon, authenticated;
revoke all on function private.reconcile_execution_learning_responses() from public, anon, authenticated;
revoke all on function private.process_execution_learning_outbox(integer) from public, anon, authenticated;
revoke all on function private.enqueue_execution_learning() from public, anon, authenticated;

commit;
