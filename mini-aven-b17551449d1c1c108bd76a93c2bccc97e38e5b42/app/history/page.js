'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function HistoryPage() {
  // รายการประวัติการขายทั้งหมด
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // โหลดข้อมูลตอน component mount
  useEffect(() => {
    fetchSales();
  }, []);

  // ดึงข้อมูลจากตาราง sales เรียงจากล่าสุดไปเก่าสุด
  async function fetchSales() {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('sold_at', { ascending: false });

    if (error) {
      setErrorMsg('โหลดประวัติการขายไม่สำเร็จ: ' + error.message);
    } else {
      setSales(data);
      setErrorMsg('');
    }
    setLoading(false);
  }

  // คำนวณยอดขายรวมทั้งหมดจาก total_price ของทุกรายการ
  const grandTotal = sales.reduce(
    (sum, sale) => sum + (Number(sale.total_price) || 0),
    0
  );

  // แปลง timestamp ให้อ่านง่ายในรูปแบบไทย
  function formatDateTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  return (
    <div>
      <h1>ประวัติการขาย</h1>

      {errorMsg && (
        <p style={{ color: '#dc2626', fontWeight: 600 }}>{errorMsg}</p>
      )}

      {/* สรุปยอดขายรวมทั้งหมด */}
      <div
        style={{
          fontWeight: 700,
          fontSize: '1.2rem',
          backgroundColor: '#fff',
          padding: '16px 20px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          marginBottom: '20px',
        }}
      >
        ยอดขายรวมทั้งหมด: {grandTotal.toFixed(2)} บาท
      </div>

      {loading ? (
        <p>กำลังโหลดข้อมูล...</p>
      ) : sales.length === 0 ? (
        <p>ยังไม่มีประวัติการขาย</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>วันเวลาที่ขาย</th>
              <th>ชื่อสินค้า</th>
              <th>จำนวน</th>
              <th>ยอดรวม</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td>{formatDateTime(sale.sold_at)}</td>
                <td>{sale.product_name}</td>
                <td>{sale.quantity}</td>
                <td>{Number(sale.total_price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
