import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.2";
import { parseAllowedOrigins } from "./contract.ts";
import { handleOwnerApiRequest } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = parseAllowedOrigins(
  Deno.env.get("PANDORA_ALLOWED_ORIGINS"),
);

Deno.serve(async (req: Request) => {
  return await handleOwnerApiRequest(req, {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    ALLOWED_ORIGINS,
    createClient
  });
});
