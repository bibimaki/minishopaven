// Route Handler ฝั่ง server เท่านั้น — ตัวแปร TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
// (ไม่มี NEXT_PUBLIC_ นำหน้า) จะไม่ถูกฝังไปในโค้ดฝั่ง browser เด็ดขาด
// เพื่อป้องกัน bot token รั่วไหลไปสู่ผู้ใช้ปลายทาง

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatBaht(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function buildOrderMessage({ productName, qty, lineTotal, stockAfter }) {
  const timeStr = new Date().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    timeStyle: "medium",
  });
  return (
    `🛍️ <b>มีรายการขายใหม่!</b>\n` +
    `- สินค้า: ${escapeHtml(productName)}\n` +
    `- จำนวน: ${qty} ชิ้น\n` +
    `- ราคารวม: ${formatBaht(lineTotal)} บาท\n` +
    `- สต๊อกคงเหลือปัจจุบัน: ${stockAfter} ชิ้น\n` +
    `- เวลา: ${timeStr}`
  );
}

function buildLowStockMessage({ productName, stockAfter }) {
  return (
    `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n` +
    `- สินค้า: ${escapeHtml(productName)}\n` +
    `- คงเหลือเพียง: ${stockAfter} ชิ้น\n` +
    `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`
  );
}

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { ok: false, skipped: true, reason: "Telegram env vars not configured" };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data };
  }
  return { ok: true };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { type, payload } = body || {};

    let text;
    if (type === "order") {
      text = buildOrderMessage(payload || {});
    } else if (type === "low_stock") {
      text = buildLowStockMessage(payload || {});
    } else {
      return Response.json({ ok: false, error: "Unknown notification type" }, { status: 400 });
    }

    const result = await sendTelegramMessage(text);
    // ไม่ throw error กลับไปเป็น 5xx เพื่อไม่ให้ฝั่ง client (หน้าเว็บขายสินค้า) พังตาม
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error("notify-telegram route error:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
