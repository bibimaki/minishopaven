"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [selectedSku, setSelectedSku] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("sku,name,price,stock,unit")
      .order("sku");

    if (error) {
      setMessage("โหลดสินค้าไม่สำเร็จ: " + error.message);
      return;
    }

    setProducts(data || []);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const selectedProduct = products.find(
    (product) => product.sku === selectedSku
  );

  const sellProduct = async () => {
    setMessage("");

    if (!selectedProduct) {
      setMessage("กรุณาเลือกสินค้า");
      return;
    }

    const qty = Number(quantity);

    if (!Number.isInteger(qty) || qty <= 0) {
      setMessage("กรุณาใส่จำนวนสินค้าให้ถูกต้อง");
      return;
    }

    if (qty > selectedProduct.stock) {
      setMessage(
        `สินค้าไม่พอ เหลือ ${selectedProduct.stock} ${selectedProduct.unit}`
      );
      return;
    }

    setLoading(true);

    const total = Number(selectedProduct.price) * qty;

    const { error } = await supabase.from("sales").insert({
      product_name: selectedProduct.name,
      quantity: qty,
      total_price: total,
    });

    if (error) {
      setMessage("ขายสินค้าไม่สำเร็จ: " + error.message);
      setLoading(false);
      return;
    }

    const { error: stockError } = await supabase
      .from("products")
      .update({
        stock: selectedProduct.stock - qty,
      })
      .eq("sku", selectedProduct.sku);

    if (stockError) {
      setMessage("บันทึกการขายแล้ว แต่หักสต็อกไม่สำเร็จ");
      setLoading(false);
      await loadProducts();
      return;
    }

    setMessage(
      `ขายสำเร็จ! ${selectedProduct.name} × ${qty} = ฿${total.toLocaleString()}`
    );

    setQuantity(1);
    setLoading(false);

    await loadProducts();
  };

  return (
    <main
      style={{
        maxWidth: "700px",
        margin: "40px auto",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>ขายสินค้า</h1>

      <div style={{ marginTop: "30px" }}>
        <label>เลือกสินค้า</label>

        <select
          value={selectedSku}
          onChange={(e) => setSelectedSku(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            marginTop: "8px",
            fontSize: "16px",
          }}
        >
          <option value="">-- เลือกสินค้า --</option>

          {products.map((product) => (
            <option key={product.sku} value={product.sku}>
              {product.name} — ฿{Number(product.price).toLocaleString()} — เหลือ{" "}
              {product.stock} {product.unit}
            </option>
          ))}
        </select>
      </div>

      {selectedProduct && (
        <div
          style={{
            marginTop: "20px",
            padding: "20px",
            border: "1px solid #ddd",
            borderRadius: "12px",
          }}
        >
          <h2>{selectedProduct.name}</h2>

          <p>
            ราคา: ฿{Number(selectedProduct.price).toLocaleString()}
          </p>

          <p>
            คงเหลือ: {selectedProduct.stock} {selectedProduct.unit}
          </p>

          <p>SKU: {selectedProduct.sku}</p>
        </div>
      )}

      <div style={{ marginTop: "20px" }}>
        <label>จำนวน</label>

        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            marginTop: "8px",
            fontSize: "16px",
          }}
        />
      </div>

      {selectedProduct && (
        <div
          style={{
            marginTop: "20px",
            fontSize: "20px",
            fontWeight: "bold",
          }}
        >
          รวม: ฿
          {(
            Number(selectedProduct.price) * Number(quantity || 0)
          ).toLocaleString()}
        </div>
      )}

      <button
        onClick={sellProduct}
        disabled={loading}
        style={{
          width: "100%",
          marginTop: "25px",
          padding: "14px",
          fontSize: "18px",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "กำลังบันทึก..." : "ขายสินค้า"}
      </button>

      {message && (
        <div
          style={{
            marginTop: "20px",
            padding: "15px",
            borderRadius: "10px",
            background: "#f5f5f5",
          }}
        >
          {message}
        </div>
      )}
    </main>
  );
}
