// Fire-and-forget notifier. Always resolves — never rejects — so a failed
// or slow Telegram call can never break the checkout flow that calls it.
export async function notifyTelegram(text) {
  try {
    await fetch("/api/notify-telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.warn("Mini POS: Telegram notification failed.", err);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildOrderAlertMessage(item, stockAfter) {
  const time = new Date().toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const lineTotal = (item.price * item.qty).toLocaleString("en-US");
  return (
    `🛍️ <b>มีรายการขายใหม่!</b>\n` +
    `- สินค้า: ${escapeHtml(item.name)}\n` +
    `- จำนวน: ${item.qty} ชิ้น\n` +
    `- ราคารวม: ${lineTotal} บาท\n` +
    `- สต๊อกคงเหลือปัจจุบัน: ${stockAfter} ชิ้น\n` +
    `- เวลา: ${time}`
  );
}

export function buildLowStockMessage(item, stockAfter) {
  return (
    `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n` +
    `- สินค้า: ${escapeHtml(item.name)}\n` +
    `- คงเหลือเพียง: ${stockAfter} ชิ้น\n` +
    `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`
  );
}

export const LOW_STOCK_THRESHOLD = 5;
