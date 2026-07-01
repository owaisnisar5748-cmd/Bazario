import { BadgeCheck, PackageCheck, Store } from "lucide-react";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import "./Storefront.css";

function About() {
  return (
    <div className="store-page">
      <Navbar />
      <main className="store-shell">
        <section className="store-hero" style={{ "--hero-image": "url(https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1800&q=85)" }}>
          <div className="store-hero__content">
            <p className="store-eyebrow">About Bazario</p>
            <h1>A marketplace designed for trust.</h1>
            <p>Bazario connects customers and independent sellers through clear inventory, secure accounts, and dependable order management.</p>
          </div>
        </section>
        <div className="store-heading"><div><h2>What we value</h2><p>Useful commerce technology should feel straightforward for everyone using it.</p></div></div>
        <section className="store-grid">
          {[
            [BadgeCheck, "Secure by default", "Protected customer data and role-aware access throughout the platform."],
            [PackageCheck, "Accurate inventory", "Stock is validated when products enter the cart and when orders are placed."],
            [Store, "Seller ownership", "Sellers have practical tools to publish products and manage fulfillment."],
          ].map(([Icon, title, text]) => (
            <article className="store-card" key={title}>
              <Icon color="#155eef" size={28} />
              <h2>{title}</h2>
              <p style={{ color: "#667085", lineHeight: 1.7 }}>{text}</p>
            </article>
          ))}
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default About;
