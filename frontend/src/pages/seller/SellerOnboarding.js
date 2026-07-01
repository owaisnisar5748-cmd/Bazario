import { ArrowLeft, ArrowRight, Building2, CheckCircle2, MapPin, Phone, Store, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../../services/api";
import { updateStoredUser } from "../../services/auth";
import "./SellerDashboard.css";

const initialOnboarding = {
  store_name: "",
  business_phone: "",
  pickup_address: "",
  business_id: "",
  payout_name: "",
  payout_upi: "",
  bank_account: "",
  bank_ifsc: "",
};

function SellerOnboarding() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialOnboarding);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.getSellerOnboarding()
      .then((response) => {
        setForm({ ...initialOnboarding, ...(response.data.onboarding || {}) });
      })
      .catch((error) => {
        setStatus({ type: "error", text: error.response?.data?.detail || "Could not load seller onboarding." });
      })
      .finally(() => setLoading(false));
  }, []);

  const completion = useMemo(() => {
    const required = [form.store_name, form.business_phone, form.pickup_address, form.payout_name];
    const payoutReady = form.payout_upi || (form.bank_account && form.bank_ifsc);
    return Math.round(((required.filter((item) => item.trim()).length + Number(Boolean(payoutReady))) / 5) * 100);
  }, [form]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setStatus(null);
  };

  const saveOnboarding = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await authApi.updateSellerOnboarding(form);
      updateStoredUser(response.data.user);
      setStatus({ type: "success", text: "Seller setup saved. You can now add products." });
      window.setTimeout(() => navigate("/seller-dashboard"), 700);
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not save seller onboarding." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="seller-page seller-onboarding-page">
      <nav className="seller-topbar">
        <button type="button" onClick={() => navigate("/seller-dashboard")}>
          <ArrowLeft size={17} /> Seller studio
        </button>
      </nav>

      <section className="seller-section seller-onboarding-hero">
        <div>
          <p>Seller onboarding</p>
          <h1>Prepare your store for real orders.</h1>
          <span>Add pickup and payout details before listing products on Bazario.</span>
        </div>
        <aside>
          <strong>{completion}%</strong>
          <span>profile complete</span>
        </aside>
      </section>

      {status && <div className={`seller-status seller-status--${status.type}`}>{status.text}</div>}
      {loading ? <div className="seller-empty">Loading seller setup...</div> : (
        <form className="seller-section seller-onboarding-form" onSubmit={saveOnboarding}>
          <section>
            <div>
              <Store size={20} />
              <h2>Store identity</h2>
            </div>
            <label>
              Store name
              <input name="store_name" required value={form.store_name} onChange={updateField} placeholder="Bazario Kashmir Store" />
            </label>
            <label>
              Business phone
              <input name="business_phone" required value={form.business_phone} onChange={updateField} placeholder="9876543210" />
            </label>
            <label>
              GST / business ID optional
              <input name="business_id" value={form.business_id} onChange={updateField} placeholder="GSTIN or local business ID" />
            </label>
          </section>

          <section>
            <div>
              <MapPin size={20} />
              <h2>Pickup address</h2>
            </div>
            <label>
              Pickup address
              <textarea name="pickup_address" required value={form.pickup_address} onChange={updateField} placeholder="Shop number, market, city, state, pincode" />
            </label>
          </section>

          <section>
            <div>
              <WalletCards size={20} />
              <h2>Payout details</h2>
            </div>
            <label>
              Account holder name
              <input name="payout_name" required value={form.payout_name} onChange={updateField} placeholder="Owais Nisar" />
            </label>
            <label>
              UPI ID
              <input name="payout_upi" value={form.payout_upi} onChange={updateField} placeholder="name@upi" />
            </label>
            <div className="seller-onboarding-form__row">
              <label>
                Bank account
                <input name="bank_account" value={form.bank_account} onChange={updateField} placeholder="Account number" />
              </label>
              <label>
                IFSC
                <input name="bank_ifsc" value={form.bank_ifsc} onChange={updateField} placeholder="SBIN0000000" />
              </label>
            </div>
            <small>Add either UPI ID or both bank account and IFSC.</small>
          </section>

          <div className="seller-onboarding-checks">
            <span><CheckCircle2 size={16} /> Store name</span>
            <span><Phone size={16} /> Business phone</span>
            <span><Building2 size={16} /> Pickup and payout</span>
          </div>

          <button className="seller-onboarding-submit" type="submit" disabled={saving}>
            {saving ? "Saving setup..." : "Save seller setup"} <ArrowRight size={17} />
          </button>
        </form>
      )}
    </main>
  );
}

export default SellerOnboarding;
