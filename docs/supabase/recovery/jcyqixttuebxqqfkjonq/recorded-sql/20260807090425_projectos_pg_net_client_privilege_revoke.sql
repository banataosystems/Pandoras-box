begin;

revoke usage on schema net from public;
revoke usage on schema net from anon;
revoke usage on schema net from authenticated;

revoke all privileges on all tables in schema net from public;
revoke all privileges on all tables in schema net from anon;
revoke all privileges on all tables in schema net from authenticated;

revoke all privileges on all sequences in schema net from public;
revoke all privileges on all sequences in schema net from anon;
revoke all privileges on all sequences in schema net from authenticated;

revoke all privileges on all functions in schema net from public;
revoke all privileges on all functions in schema net from anon;
revoke all privileges on all functions in schema net from authenticated;

commit;
