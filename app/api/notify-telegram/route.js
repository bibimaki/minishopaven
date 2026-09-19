// Server-only route. TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are read from
// process.env here (NOT prefixed with NEXT_PUBLIC_), so they never get
// bundled into client-side JS or exposed in the browser.
//
// The client (app/sell/page.js) just POSTs { text } here — it never touches
// the bot token directly.

export async function POST(request) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return Response.json(
      { ok: false, error: "Telegram is not configured on the server." },
      { status: 200 }
    );
  }

  let text;
  try {
    const body = await request.json();
    text = body?.text;
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!text || typeof text !== "string") {
    return Response.json({ ok: false, error: "Missing 'text'." }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "HTML",
        }),
      }
    );
    const data = await res.json();
    if (!data.ok) {
      return Response.json(
        { ok: false, error: data.description || "Telegram API rejected the message." },
        { status: 200 }
      );
    }
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
