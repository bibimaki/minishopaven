import './globals.css';

export const metadata = {
  title: 'Mini POS',
  description: 'ระบบขายของร้านเล็ก',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        <header className="navbar">
          <div className="navbar-title">Mini POS</div>
          <nav className="navbar-links">
            <a href="/">หน้าแรก</a>
            <a href="/sell">ขายสินค้า</a>
            <a href="/history">ประวัติการขาย</a>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
