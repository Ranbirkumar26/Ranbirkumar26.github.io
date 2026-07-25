import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  source?: unknown;
  page?: unknown;
  sentAt?: unknown;
  company?: unknown;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function clean(value: unknown, max = 1200) {
  return String(value ?? "").trim().slice(0, max);
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function textEmail(name: string, email: string, message: string, page: string) {
  return [
    "New portfolio message",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    page ? `Page: ${page}` : "",
    "",
    message,
  ].filter(Boolean).join("\n");
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed." }, 405);
    }

    let payload: ContactPayload;
    try {
      payload = await req.json();
    } catch (_error) {
      return json({ ok: false, error: "Invalid JSON body." }, 400);
    }

    if (clean(payload.company)) {
      return json({ ok: true, ignored: true });
    }

    const name = clean(payload.name, 80);
    const email = clean(payload.email, 120).toLowerCase();
    const message = clean(payload.message, 1200);
    const source = clean(payload.source, 80) || "portfolio-contact";
    const page = clean(payload.page, 500);

    if (!name || !email || !message) {
      return json({ ok: false, error: "Name, email and message are required." }, 400);
    }

    if (!validEmail(email)) {
      return json({ ok: false, error: "A valid reply email is required." }, 400);
    }

    const insert = {
      name,
      email,
      message,
      source,
      page,
      user_agent: req.headers.get("user-agent"),
      metadata: {
        sentAt: typeof payload.sentAt === "string" ? payload.sentAt : null,
        origin: req.headers.get("origin"),
      },
    };

    const admin = ctx.supabaseAdmin as any;
    const { data, error } = await admin
      .from("contact_messages")
      .insert(insert)
      .select("id, created_at")
      .single();

    if (error) {
      console.error("contact insert failed", error);
      return json({ ok: false, error: "Could not save message." }, 500);
    }

    let emailSent = false;
    let emailError: string | null = null;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (resendKey) {
      const to = Deno.env.get("CONTACT_TO_EMAIL") || "rk26.ftw@gmail.com";
      const from = Deno.env.get("CONTACT_FROM_EMAIL") || "Portfolio <onboarding@resend.dev>";
      const mail = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          reply_to: email,
          subject: `Portfolio message from ${name}`,
          text: textEmail(name, email, message, page),
        }),
      });

      if (mail.ok) {
        emailSent = true;
      } else {
        emailError = await mail.text();
        console.error("contact email failed", emailError);
      }

      await admin
        .from("contact_messages")
        .update({ email_sent: emailSent, email_error: emailError })
        .eq("id", data.id);
    }

    return json({
      ok: true,
      id: data.id,
      createdAt: data.created_at,
      emailSent,
    });
  }),
};
