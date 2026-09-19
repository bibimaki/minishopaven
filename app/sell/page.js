"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "../../lib/supabaseClient";
import { SAMPLE_PRODUCTS } from "../../lib/sampleData";

function formatBaht(n) {
  return "฿" + Number(n || 0).toLocaleString("en-US");
}

const LOW_STOCK_ALERT_THRESHOLD = 5;

// ส่งแจ้งเตือนผ่าน API Route ของเราเอง (ไม่ยิง Telegram ตรงจาก browser)
// เพื่อไม่ให้ bot token หลุดไปฝั่ง client และเพื่อไม่ให้ error ของ Telegram
// กระทบขั้นตอนขายสินค้าหลัก — ฟังก์ชันนี้ "กลืน" error ทุกกรณีไว้เอง
async function notifyTelegram(type, payload) {
  try {
    await fetch("/api/notify-telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    });
  } catch (err) {
    // ตั้งใจไม่ throw ต่อ — การแจ้งเตือนล้มเหลวต้องไม่ทำให้การขายขัดข้อง
    console.warn("Mini POS: Telegram notification failed (ignored).", err);
  }
}

const CATEGORY_EMOJIS = {
  ring: "💍",
  necklace: "📿",
  bracelet: "⛓️",
  earrings: "💎",
  limited: "✨",
};
const FALLBACK_EMOJIS = ["💍", "📿", "⛓️", "💎", "✨"];

function emojiFor(product) {
  const category = String(product?.category || "").toLowerCase();
  if (category && CATEGORY_EMOJIS[category]) return CATEGORY_EMOJIS[category];

  let hash = 0;
  const str = String(product?.id ?? "");
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return FALLBACK_EMOJIS[hash % FALLBACK_EMOJIS.length];
}

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingSampleData, setUsingSampleData] = useState(false);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]); // [{ id, name, price, qty, stock }]
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null); // { message, isError }

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      if (!isSupabaseConfigured() || !supabase) {
        if (!cancelled) {
          setProducts(SAMPLE_PRODUCTS);
          setUsingSampleData(true);
          setLoading(false);
        }
        return;
      }
      try {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, price, stock, category")
          .order("name", { ascending: true });
        if (error) throw error;
        if (!cancelled) {
          if (data && data.length) {
            setProducts(data);
            setUsingSampleData(false);
          } else {
            setProducts(SAMPLE_PRODUCTS);
            setUsingSampleData(true);
          }
        }
      } catch (err) {
        console.warn("Mini POS: could not load products from Supabase.", err);
        if (!cancelled) {
          setProducts(SAMPLE_PRODUCTS);
          setUsingSampleData(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, l) => sum + l.price * l.qty, 0),
    [cart]
  );
  const cartCount = useMemo(() => cart.reduce((sum, l) => sum + l.qty, 0), [cart]);

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.id === product.id);
      const currentQty = existing ? existing.qty : 0;
      const stock = product.stock ?? Infinity;
      if (currentQty >= stock) {
        setToast({ message: `${product.name} มีไม่พอในสต็อก`, isError: true });
        return prev;
      }
      setToast({ message: `เพิ่ม ${product.name} ลงตะกร้าแล้ว`, isError: false });
      if (existing) {
        return prev.map((l) =>
          l.id === product.id ? { ...l, qty: l.qty + 1 } : l
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          price: Number(product.price) || 0,
          stock: product.stock ?? Infinity,
          qty: 1,
        },
      ];
    });
  }

  function changeQty(id, delta) {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.id !== id) return l;
          const newQty = Math.min(l.stock, Math.max(0, l.qty + delta));
          return { ...l, qty: newQty };
        })
        .filter((l) => l.qty > 0)
    );
  }

  function removeLine(id) {
    setCart((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleCheckout() {
    if (!cart.length || submitting) return;
    setSubmitting(true);

    const order = {
      items: cart.map((l) => ({ id: l.id, name: l.name, price: l.price, qty: l.qty })),
      total: cartTotal,
      created_at: new Date().toISOString(),
    };

    try {
      if (isSupabaseConfigured() && supabase) {
        const { error: saleError } = await supabase.from("sales").insert({
          items: order.items,
          total: order.total,
        });
        if (saleError) throw saleError;

        // ลดสต็อกสินค้าแต่ละรายการ (ทำแบบ best-effort ต่อรายการ)
        for (const line of cart) {
          if (!Number.isFinite(line.stock)) continue; // สินค้าตัวอย่าง ไม่มี id จริงใน DB
          const product = products.find((p) => p.id === line.id);
          if (!product) continue;
          const newStock = Math.max(0, (product.stock ?? 0) - line.qty);
          await supabase.from("products").update({ stock: newStock }).eq("id", line.id);

          // แจ้งเตือน Telegram: Order เข้าใหม่ (ยิงแบบไม่ await เพื่อไม่บล็อกการขาย
          // และตัวฟังก์ชันเองก็ดัก error ไว้แล้วไม่ให้หลุดออกมา)
          notifyTelegram("order", {
            productName: line.name,
            qty: line.qty,
            lineTotal: line.price * line.qty,
            stockAfter: newStock,
          });

          // แจ้งเตือน Telegram: สต๊อกเหลือน้อย (แยกข้อความต่างหาก ถ้าเข้าเกณฑ์)
          if (newStock <= LOW_STOCK_ALERT_THRESHOLD) {
            notifyTelegram("low_stock", {
              productName: line.name,
              stockAfter: newStock,
            });
          }
        }

        setProducts((prev) =>
          prev.map((p) => {
            const line = cart.find((l) => l.id === p.id);
            if (!line) return p;
            return { ...p, stock: Math.max(0, (p.stock ?? 0) - line.qty) };
          })
        );
      }

      setToast({ message: "บันทึกการขายสำเร็จ!", isError: false });
      setCart([]);
    } catch (err) {
      console.error("Mini POS: checkout error", err);
      setToast({ message: "เกิดข้อผิดพลาดในการบันทึกการขาย กรุณาลองใหม่", isError: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">ขายสินค้า</h1>
          <p className="page-sub">เลือกสินค้าเพื่อเพิ่มลงตะกร้า แล้วกดชำระเงิน</p>
        </div>
        <input
          type="text"
          className="search-input"
          placeholder="ค้นหาสินค้า…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {usingSampleData && (
        <div
          className="badge badge-warn"
          style={{ marginBottom: 18, display: "inline-flex" }}
        >
          กำลังแสดงสินค้าตัวอย่าง — เชื่อมต่อ Supabase และเพิ่มข้อมูลในตาราง products
          เพื่อใช้งานจริง
        </div>
      )}

      <div className="sell-layout">
        <div>
          {loading ? (
            <p className="page-sub">กำลังโหลดสินค้า…</p>
          ) : filteredProducts.length === 0 ? (
            <div className="empty-state">ไม่พบสินค้าที่ค้นหา</div>
          ) : (
            <div className="product-grid">
              {filteredProducts.map((p) => {
                const outOfStock = (p.stock ?? 0) <= 0;
                const low = !outOfStock && (p.stock ?? 0) <= 5;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="product-tile"
                    disabled={outOfStock}
                    onClick={() => addToCart(p)}
                  >
                    <div className="product-tile-top">
                      <div className="product-emoji">{emojiFor(p)}</div>
                      <span
                        className={`product-stock${
                          outOfStock ? " out" : low ? " low" : ""
                        }`}
                      >
                        {outOfStock ? "หมด" : `คงเหลือ ${p.stock}`}
                      </span>
                    </div>
                    <div className="product-name">{p.name}</div>
                    <div className="product-price">{formatBaht(p.price)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="card card-pad cart-card">
          <h2 className="section-title">ตะกร้าสินค้า</h2>
          {cart.length === 0 ? (
            <div className="cart-empty">ยังไม่มีสินค้าในตะกร้า</div>
          ) : (
            <div>
              {cart.map((line) => (
                <div className="cart-line" key={line.id}>
                  <div className="cart-line-info">
                    <div className="cart-line-name">{line.name}</div>
                    <div className="cart-line-price">
                      {formatBaht(line.price)} / ชิ้น
                    </div>
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => removeLine(line.id)}
                    >
                      ลบ
                    </button>
                  </div>
                  <div className="qty-control">
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => changeQty(line.id, -1)}
                    >
                      −
                    </button>
                    <span className="qty-num">{line.qty}</span>
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => changeQty(line.id, 1)}
                      disabled={line.qty >= line.stock}
                    >
                      +
                    </button>
                  </div>
                  <div className="line-total">
                    {formatBaht(line.price * line.qty)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="cart-summary-row">
            <span>จำนวนชิ้น</span>
            <span>{cartCount}</span>
          </div>
          <div className="cart-summary-row total">
            <span>ยอดรวม</span>
            <span>{formatBaht(cartTotal)}</span>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 16 }}
            disabled={!cart.length || submitting}
            onClick={handleCheckout}
          >
            {submitting ? (
              <>
                <span className="spinner" /> กำลังบันทึก…
              </>
            ) : (
              "ชำระเงิน"
            )}
          </button>
        </aside>
      </div>

      {toast && (
        <div className={`toast show${toast.isError ? " error" : ""}`}>
          {toast.message}
        </div>
      )}
    </>
  );
}
