import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";

Deno.serve(() =>
  new Response(
    JSON.stringify({
      code: "RETIRED",
      message: "The temporary FlutterFlow credential handoff is retired.",
    }),
    {
      status: 410,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, max-age=0",
      },
    },
  )
);
