import { Link } from "react-router-dom";
import "./Footer.css";

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__grid">
        <section>
          <h2>Bazario</h2>
          <p>A secure marketplace for thoughtful shopping and independent sellers.</p>
        </section>
        <section>
          <h3>Shop</h3>
          <nav>
            <Link to="/products">All products</Link>
            <Link to="/cart">Cart</Link>
            <Link to="/my-orders">My orders</Link>
          </nav>
        </section>
        <section>
          <h3>Categories</h3>
          <nav>
            <Link to="/products?category=clothes">Clothes</Link>
            <Link to="/products?category=electronics">Electronics</Link>
            <Link to="/products?category=cosmetics">Cosmetics</Link>
            <Link to="/products?category=medicines">Medicines</Link>
          </nav>
        </section>
        <section>
          <h3>Support</h3>
          <p>support@bazario.com</p>
          <p>Secure checkout and account support.</p>
        </section>
      </div>
      <div className="site-footer__bottom">{"\u00A9"} 2026 Bazario. All rights reserved.</div>
    </footer>
  );
}

export default Footer;
