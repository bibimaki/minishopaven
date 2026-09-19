'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  // รายการสินค้าทั้งหมด
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // ข้อมูลฟอร์มเพิ่มสินค้าใหม่
  const [form, setForm] = useState({
    sku: '',
    name: '',
    price: '',
    stock: '',
    unit: '',
  });

  // id ของแถวที่กำลังแก้ไขแบบ inline (null = ไม่มีแถวไหนถูกแก้ไข)
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // โหลดรายการสินค้าตอน component mount
  useEffect(() => {
    fetchProducts();
  }, []);

  // ดึงข้อมูลสินค้าทั้งหมดจากตาราง products เรียงตามวันที่สร้างล่าสุดก่อน
  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setErrorMsg('โหลดข้อมูลสินค้าไม่สำเร็จ: ' + error.message);
    } else {
      setProducts(data);
      setErrorMsg('');
    }
    setLoading(false);
  }

  // จัดการค่าที่พิมพ์ในฟอร์มเพิ่มสินค้าใหม่
  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // เพิ่มสินค้าใหม่ลงตาราง products
  async function handleAddProduct(e) {
    e.preventDefault();

    if (!form.sku || !form.name) {
      setErrorMsg('กรุณากรอก SKU และชื่อสินค้า');
      return;
    }

    const { error } = await supabase.from('products').insert([
      {
        sku: form.sku,
        name: form.name,
        price: parseFloat(form.price) || 0,
        stock: parseInt(form.stock, 10) || 0,
        unit: form.unit,
      },
    ]);

    if (error) {
      setErrorMsg('เพิ่มสินค้าไม่สำเร็จ: ' + error.message);
      return;
    }

    // เคลียร์ฟอร์มและโหลดข้อมูลใหม่
    setForm({ sku: '', name: '', price: '', stock: '', unit: '' });
    setErrorMsg('');
    fetchProducts();
  }

  // เริ่มแก้ไขแถวนี้ (เก็บค่าปัจจุบันไว้ใน editForm)
  function startEdit(product) {
    setEditingId(product.id);
    setEditForm({
      sku: product.sku,
      name: product.name,
      price: product.price,
      stock: product.stock,
      unit: product.unit,
    });
  }

  // ยกเลิกการแก้ไข
  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  // จัดการค่าที่พิมพ์ในฟอร์มแก้ไข inline
  function handleEditChange(e) {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  }

  // บันทึกการแก้ไขสินค้ากลับไปยัง Supabase
  async function handleSaveEdit(id) {
    const { error } = await supabase
      .from('products')
      .update({
        sku: editForm.sku,
        name: editForm.name,
        price: parseFloat(editForm.price) || 0,
        stock: parseInt(editForm.stock, 10) || 0,
        unit: editForm.unit,
      })
      .eq('id', id);

    if (error) {
      setErrorMsg('แก้ไขสินค้าไม่สำเร็จ: ' + error.message);
      return;
    }

    setEditingId(null);
    setEditForm({});
    setErrorMsg('');
    fetchProducts();
  }

  // ลบสินค้า
  async function handleDelete(id) {
    const confirmed = window.confirm('ยืนยันลบสินค้านี้หรือไม่?');
    if (!confirmed) return;

    const { error } = await supabase.from('products').delete().eq('id', id);

    if (error) {
      setErrorMsg('ลบสินค้าไม่สำเร็จ: ' + error.message);
      return;
    }

    fetchProducts();
  }

  return (
    <div>
      <h1>รายการสินค้า</h1>

      {errorMsg && (
        <p style={{ color: '#dc2626', fontWeight: 600 }}>{errorMsg}</p>
      )}

      {/* ฟอร์มเพิ่มสินค้าใหม่ */}
      <form onSubmit={handleAddProduct}>
        <h3 style={{ margin: 0 }}>เพิ่มสินค้าใหม่</h3>
        <input
          type="text"
          name="sku"
          placeholder="SKU"
          value={form.sku}
          onChange={handleFormChange}
          required
        />
        <input
          type="text"
          name="name"
          placeholder="ชื่อสินค้า"
          value={form.name}
          onChange={handleFormChange}
          required
        />
        <input
          type="number"
          name="price"
          placeholder="ราคา"
          value={form.price}
          onChange={handleFormChange}
          step="0.01"
          min="0"
        />
        <input
          type="number"
          name="stock"
          placeholder="จำนวนคงเหลือ"
          value={form.stock}
          onChange={handleFormChange}
          min="0"
        />
        <input
          type="text"
          name="unit"
          placeholder="หน่วย (เช่น ชิ้น, ขวด)"
          value={form.unit}
          onChange={handleFormChange}
        />
        <button type="submit">เพิ่มสินค้า</button>
      </form>

      {/* ตารางแสดงรายการสินค้า */}
      {loading ? (
        <p>กำลังโหลดข้อมูล...</p>
      ) : products.length === 0 ? (
        <p>ยังไม่มีสินค้าในระบบ</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>ชื่อสินค้า</th>
              <th>ราคา</th>
              <th>คงเหลือ</th>
              <th>หน่วย</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                {editingId === product.id ? (
                  // แถวโหมดแก้ไข inline
                  <>
                    <td>
                      <input
                        type="text"
                        name="sku"
                        value={editForm.sku}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        name="name"
                        value={editForm.name}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        name="price"
                        value={editForm.price}
                        onChange={handleEditChange}
                        step="0.01"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        name="stock"
                        value={editForm.stock}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        name="unit"
                        value={editForm.unit}
                        onChange={handleEditChange}
                      />
                    </td>
                    <td style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => handleSaveEdit(product.id)}>
                        บันทึก
                      </button>
                      <button onClick={cancelEdit}>ยกเลิก</button>
                    </td>
                  </>
                ) : (
                  // แถวโหมดแสดงผลปกติ
                  <>
                    <td>{product.sku}</td>
                    <td>{product.name}</td>
                    <td>{Number(product.price).toFixed(2)}</td>
                    <td>{product.stock}</td>
                    <td>{product.unit}</td>
                    <td style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => startEdit(product)}>แก้ไข</button>
                      <button onClick={() => handleDelete(product.id)}>
                        ลบ
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
