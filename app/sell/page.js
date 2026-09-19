"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../../lib/supabaseClient";
import { PRODUCTS as FALLBACK_PRODUCTS } from "../../lib/products";
import {
  notifyTelegram,
  buildOrderAlertMessage,
  buildLowStockMessage,
  LOW_STOCK_THRESHOLD,
} from "../../lib/telegram";

function formatBaht(n) {
  return "฿" + Number(n || 0).toLocaleString("en-US");
}

export default function SellPage() {
  const [products, setProducts] = useState(FALLBACK_PRODUCTS);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cart, setCart] = useState([]);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadProducts() {
    if (!supabase) {
      setProducts(FALLBACK_PRODUCTS);
      setLoadingProducts(false);
      return;
    }
    setLoadingProducts(true);
    const { data, error } = await supabase.from("products").select("*").order("id");
    if (error || !data || !data.length) {
      setProducts(FALLBACK_PRODUCTS);
    } else {
      setProducts(data);
    }
    setLoadingProducts(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  function findProduct(id) {
    return products.find((p) => p.id === id);
  }

  function addToCart(product) {
    setStatus(null);
    if (product.stock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.id === product.id);
      const currentQty = existing ? existing.qty : 0;
      if (currentQty >= product.stock) return prev;
      if (existing) {
        return prev.map((l) =>
          l.id === product.id ? { ...l, qty: l.qty + 1 } : l
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  }

  function changeQty(id, delta) {
    const product = findProduct(id);
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.id !== id) return l;
          const nextQty = l.qty + delta;
          const clamped = product ? Math.min(nextQty, product.stock) : nextQty;
          return { ...l, qty: clamped };
        })
        .filter((l) => l.qty > 0)
    );
  }

  function removeLine(id) {
    setCart((prev) => prev.filter((l) => l.id !== id));
  }

  const total = cart.reduce((sum, l) => sum + l.price * l.qty, 0);
  const totalQty = cart.reduce((sum, l) => sum + l.qty, 0);

  async function handleCheckout() {
    if (!cart.length || submitting) return;
    setSubmitting(true);
    setStatus({ mode: "pending", message: "กำลังตัดสต๊อกและบันทึกการขาย…" });

    if (!supabase) {
      setSubmitting(false);
      setStatus({
        mode: "error",
        message: "ยังไม่ได้เชื่อมต่อ Supabase จึงบันทึกการขายไม่ได้ กรุณาตั้งค่า Environment Variables ก่อน",
      });
      return;
    }

    const fulfilled = [];
    const unavailable = [];

    for (const line of cart) {
      try {
        const { data: fresh, error: readErr } = await supabase
          .from("products")
          .select("id, stock")
          .eq("id", line.id)
          .single();

        if (readErr || !fresh) {
          unavailable.push({ name: line.name, reason: "not-found" });
          continue;
        }

        const qtyToDeduct = Math.min(line.qty, fresh.stock);
        if (qtyToDeduct <= 0) {
          unavailable.push({ name: line.name, reason: "sold-out" });
          continue;
        }

        const stockAfter = fresh.stock - qtyToDeduct;
        const { error: updateErr } = await supabase
          .from("products")
          .update({ stock: stockAfter })
          .eq("id", line.id)
          .gte("stock", qtyToDeduct);

        if (updateErr) {
          unavailable.push({ name: line.name, reason: "update-failed" });
          continue;
        }

        fulfilled.push({
          id: line.id,
          name: line.name,
          price: line.price,
          qty: qtyToDeduct,
          stockAfter,
        });
        if (qtyToDeduct < line.qty) {
          unavailable.push({ name: line.name, reason: "partial" });
        }
      } catch (err) {
        unavailable.push({ name: line.name, reason: "error" });
      }
    }

    if (!fulfilled.length) {
      setSubmitting(false);
      setStatus({
        mode: "error",
        message: "สินค้าที่เลือกหมดสต๊อกแล้ว กรุณาลองใหม่อีกครั้ง",
      });
      loadProducts();
      return;
    }

    const fulfilledTotal = fulfilled.reduce((sum, it) => sum + it.price * it.qty, 0);
    const { error: saleErr } = await supabase.from("sales").insert({
      created_at: new Date().toISOString(),
      items: fulfilled.map((it) => ({ id: it.id, name: it.name, qty: it.qty, price: it.price })),
      total: fulfilledTotal,
    });

    setSubmitting(false);

    if (saleErr) {
      setStatus({ mode: "error", message: "บันทึกการขายไม่สำเร็จ: " + saleErr.message });
      loadProducts();
      return;
    }

    for (const item of fulfilled) {
      notifyTelegram(buildOrderAlertMessage(item, item.stockAfter));
      if (item.stockAfter <= LOW_STOCK_THRESHOLD) {
        notifyTelegram(buildLowStockMessage(item, item.stockAfter));
      }
    }

    setStatus({
      mode: "success",
      message: unavailable.length
        ? `บันทึกการขายสำเร็จบางส่วน — บางรายการสต๊อกไม่พอ (${unavailable.map((u) => u.name).join(", ")})`
        : "บันทึกการขายเรียบร้อยแล้ว!",
    });
    setCart([]);
    loadProducts();
  }

  return (
    <div>
      <div className="page-header">
        <h1>ขายสินค้า</h1>
        <p>เลือกสินค้าเพื่อเพิ่มลงตะกร้า แล้วกดชำระเงินเมื่อพร้อม</p>
      </div>

      {!isSupabaseConfigured && (
        <div className="notice">
          ยังไม่ได้ตั้งค่า Supabase — สามารถทดลองใช้ตะกร้าได้ แต่จะไม่สามารถบันทึกการขายหรือตัดสต๊อกได้จนกว่าจะตั้งค่า Environment Variables
        </div>
      )}

      <div className="sell-layout">
        <div className="product-list">
          {products.map((p) => (
            <button
              key={p.id}
              className="product-tile"
              onClick={() => addToCart(p)}
              type="button"
              disabled={p.stock <= 0}
            >
              <div className="product-tile-top">
                <span className="product-name">{p.name}</span>
              </div>
              <span className="product-unit">ต่อ {p.unit}</span>
              <span className="product-price">{formatBaht(p.price)}</span>
              <span className="product-unit">
                {p.stock <= 0
                  ? "สินค้าหมด"
                  : p.stock <= LOW_STOCK_THRESHOLD
                  ? `เหลือ ${p.stock} ชิ้น (ใกล้หมด)`
                  : `คงเหลือ ${p.stock} ชิ้น`}
              </span>
            </button>
          ))}
        </div>

        <aside className="card cart-panel">
          <div className="cart-header">
            <h2>ตะกร้าสินค้า</h2>
            <span className="stat-sub">{totalQty} ชิ้น</span>
          </div>

          {cart.length === 0 ? (
            <div className="cart-empty">ยังไม่มีสินค้าในตะกร้า<br />แตะสินค้าด้านซ้ายเพื่อเพิ่ม</div>
          ) : (
            <ul>
              {cart.map((l) => (
                <li key={l.id} className="cart-line">
                  <div className="cart-line-meta">
                    <div className="cart-line-name">{l.name}</div>
                    <div className="cart-line-price">{formatBaht(l.price)} / {l.unit}</div>
                    <button className="remove-btn" onClick={() => removeLine(l.id)} type="button">
                      ลบ
                    </button>
                  </div>
                  <div className="qty-control">
                    <button className="qty-btn" onClick={() => changeQty(l.id, -1)} type="button">−</button>
                    <span className="qty-val">{l.qty}</span>
                    <button className="qty-btn" onClick={() => changeQty(l.id, 1)} type="button">+</button>
                  </div>
                  <div className="line-total">{formatBaht(l.price * l.qty)}</div>
                </li>
              ))}
            </ul>
          )}

          <div className="cart-summary">
            <div className="summary-row total">
              <span>ยอดรวม</span>
              <span>{formatBaht(total)}</span>
            </div>
          </div>

          <button
            className="btn btn-primary btn-full"
            style={{ marginTop: "14px" }}
            disabled={!cart.length || submitting || loadingProducts}
            onClick={handleCheckout}
            type="button"
          >
            {submitting ? "กำลังบันทึก…" : "ชำระเงิน"}
          </button>

          {status && (
            <div className={"status-msg " + status.mode}>{status.message}</div>
          )}
        </aside>
      </div>
    </div>
  );
}
