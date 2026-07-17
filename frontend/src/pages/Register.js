import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Lock, Mail, Phone, ShieldCheck, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import { authApi, otpApi } from "../services/api";
import "./Register.css";

const categoryTiles = [
  {
    label: "Clothes",
    image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=700&q=80",
  },
  {
    label: "Electronics",
    image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=700&q=80",
  },
  {
    label: "Cosmetics",
    image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=700&q=80",
  },
  {
    label: "Medicines",
    image: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=700&q=80",
  },
];

const initialForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  gender: "",
  role: "customer",
};

function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [emailOtpAvailable, setEmailOtpAvailable] = useState(false);
  const [otpRequired, setOtpRequired] = useState(true);
  const [checkingOtpChannels, setCheckingOtpChannels] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordStrength = useMemo(() => {
    let score = 0;

    if (form.password.length >= 8) score += 1;
    if (/[A-Z]/.test(form.password)) score += 1;
    if (/[0-9]/.test(form.password)) score += 1;
    if (/[^A-Za-z0-9]/.test(form.password)) score += 1;

    if (!form.password) return { label: "Use at least 8 characters", score: 0 };
    if (score <= 1) return { label: "Weak password", score: 1 };
    if (score <= 3) return { label: "Good password", score };
    return { label: "Strong password", score };
  }, [form.password]);

  useEffect(() => {
    otpApi.getChannels()
      .then((response) => {
        const channels = response.data.channels || {};
        setEmailOtpAvailable(Boolean(channels.email));
        setOtpRequired(response.data.registration_requires_verification !== false);
      })
      .catch(() => {
        setEmailOtpAvailable(false);
        setOtpRequired(true);
      })
      .finally(() => setCheckingOtpChannels(false));
  }, []);

  useEffect(() => {
    if (!otpCountdown) return undefined;

    const timer = setTimeout(() => {
      setOtpCountdown((seconds) => seconds - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [otpCountdown]);

  const updateField = (event) => {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));

    setErrors((currentErrors) => ({
      ...currentErrors,
      [name]: "",
    }));
  };

  const validateForm = () => {
    const nextErrors = {};
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phonePattern = /^[0-9]{10}$/;

    if (!form.firstName.trim()) nextErrors.firstName = "First name is required.";
    if (!form.lastName.trim()) nextErrors.lastName = "Last name is required.";
    if (!emailPattern.test(form.email)) nextErrors.email = "Enter a valid email address.";
    if (form.phone && !phonePattern.test(form.phone)) {
      nextErrors.phone = "Use a 10 digit phone number.";
    }
    if (form.password.length < 8) nextErrors.password = "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }
    if (!form.gender) nextErrors.gender = "Select your gender.";
    if (otpRequired && !otpSent) nextErrors.otp = "Send the OTP before registering.";
    if (otpRequired && otpSent && enteredOtp.length !== 6) nextErrors.otp = "Enter the 6 digit OTP.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const sendOtp = async () => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = form.email.trim().toLowerCase();

    if (!emailPattern.test(normalizedEmail)) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        email: "Enter a valid email before requesting an OTP.",
      }));
      setStatus(null);
      return;
    }

    try {
      const response = await otpApi.send(normalizedEmail, "email", form.phone.trim());
      setForm((currentForm) => ({ ...currentForm, email: normalizedEmail }));
      setOtpSent(true);
      setOtpCountdown(30);
      setEnteredOtp("");
      setErrors((currentErrors) => ({ ...currentErrors, otp: "" }));
      setStatus({
        type: "success",
        message: response.data.dev_otp
          ? `Your verification code: ${response.data.dev_otp}`
          : "OTP sent to your email.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.response?.data?.detail || "Could not send OTP. Check email configuration.",
      });
    }
  };

  const register = async (event) => {
    event.preventDefault();
    setStatus(null);

    if (!validateForm()) return;

    setLoading(true);

    try {
      const normalizedEmail = form.email.trim().toLowerCase();
      if (otpRequired) {
        const verification = await otpApi.verify(
          normalizedEmail,
          enteredOtp,
          "email",
          form.phone.trim()
        );
        if (!verification.data.success) {
          setErrors((currentErrors) => ({
            ...currentErrors,
            otp: verification.data.message || "Invalid OTP.",
          }));
          return;
        }
      }

      await authApi.register({
        username: normalizedEmail,
        password: form.password,
        role: form.role,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        gender: form.gender,
      });

      setStatus({
        type: "success",
        message: "Account created successfully. Redirecting to login...",
      });
      setForm(initialForm);
      setEnteredOtp("");
      setOtpSent(false);

      setTimeout(() => {
        navigate("/login");
      }, 900);
    } catch (error) {
      const statusCode = error.response?.status;
      setStatus({
        type: "error",
        message:
          error.response?.data?.detail ||
          (statusCode === 502
            ? "Bazario cannot reach the API service yet. Check the frontend BACKEND_URL setting."
            : null) ||
          (statusCode === 405
            ? "Bazario reached the API, but registration is not available at that route. Check the frontend backend proxy setting."
            : null) ||
          (statusCode
            ? `Account creation failed with server status ${statusCode}. Please try again shortly.`
            : null) ||
          "Bazario account creation is temporarily unavailable. Please try again shortly.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <main className="register-shell">
        <section className="register-showcase" aria-label="Bazario registration">
          <Link className="register-brand" to="/">
            <span className="register-brand__mark">B</span>
            <span>
              <strong>Bazario</strong>
              <small>Focused marketplace</small>
            </span>
          </Link>

          <div className="register-showcase__copy">
            <p>Join the circle</p>
            <h1>One account for four focused worlds.</h1>
            <span>
              Shop with confidence, or open a seller studio for clothes, electronics, cosmetics,
              and medicines with category-ready product details.
            </span>
          </div>

          <div className="register-showcase__grid" aria-label="Bazario categories">
            {categoryTiles.map((tile) => (
              <article key={tile.label}>
                <img src={tile.image} alt="" />
                <span>{tile.label}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="register-panel" aria-label="Create account form">
          <div className="register-panel__wash" aria-hidden="true" />
          <div className="register-card">
            <Link className="register-back" to="/login">
              <ArrowLeft size={15} />
              Back to login
            </Link>

            <div className="register-card__eyebrow">
              <ShieldCheck size={15} />
              Verified signup
            </div>

            <div className="register-card__header">
              <h2>
                Create <em>account.</em>
              </h2>
              <p>
                Use a verified email to keep your shopping, profile, and seller access protected.
              </p>
            </div>

            <div className="register-assurances">
              <span>
                <Check size={14} /> Protected signup
              </span>
              <span>
                <Check size={14} /> Customer or seller
              </span>
              <span>
                <Check size={14} /> Secure password
              </span>
            </div>

            {status && (
              <div className={`register-alert register-alert--${status.type}`} role="status">
                {status.message}
              </div>
            )}

            <form className="register-form" onSubmit={register}>
              <div className="register-form__row">
                <label className="register-field">
                  <span>First name</span>
                  <div className="register-input">
                    <User size={18} />
                    <input
                      name="firstName"
                      placeholder="Owais"
                      type="text"
                      value={form.firstName}
                      onChange={updateField}
                    />
                  </div>
                  {errors.firstName && <small>{errors.firstName}</small>}
                </label>

                <label className="register-field">
                  <span>Last name</span>
                  <div className="register-input">
                    <User size={18} />
                    <input
                      name="lastName"
                      placeholder="Khan"
                      type="text"
                      value={form.lastName}
                      onChange={updateField}
                    />
                  </div>
                  {errors.lastName && <small>{errors.lastName}</small>}
                </label>
              </div>

              <label className="register-field">
                <span>Email address</span>
                <div className="register-input">
                  <Mail size={18} />
                  <input
                    name="email"
                    placeholder="you@example.com"
                    type="email"
                    value={form.email}
                    onChange={updateField}
                  />
                </div>
                {errors.email && <small>{errors.email}</small>}
              </label>

              <label className="register-field">
                <span>Phone number</span>
                <div className="register-input">
                  <Phone size={18} />
                  <input
                    name="phone"
                    placeholder="9876543210"
                    type="tel"
                    value={form.phone}
                    onChange={updateField}
                  />
                </div>
                {errors.phone && <small>{errors.phone}</small>}
              </label>

              <section className="register-otp">
                <div className="register-otp__header">
                  <div>
                    <span>Verification method</span>
                    <small>
                      {otpRequired
                        ? "Bazario will send a six-digit code to your email."
                        : "Bazario will keep your account ready and request verification when required."}
                    </small>
                  </div>
                  <div className="register-otp__channels">
                    <button
                      className="is-active"
                      type="button"
                      disabled={checkingOtpChannels || !emailOtpAvailable}
                      onClick={() => {
                        setOtpSent(false);
                        setEnteredOtp("");
                      }}
                    >
                      <Mail size={16} /> Email
                    </button>
                  </div>
                </div>

                {!checkingOtpChannels && !otpRequired && (
                  <p className="register-otp__note">
                    Account verification is currently handled after signup. You can create your account now.
                  </p>
                )}

                {!checkingOtpChannels && otpRequired && !emailOtpAvailable && (
                  <p className="register-otp__unavailable">
                    Email verification is temporarily unavailable. Please try again shortly.
                  </p>
                )}

                {otpRequired && (
                  <button
                    className="register-otp__send"
                    type="button"
                    onClick={sendOtp}
                    disabled={
                      checkingOtpChannels ||
                      otpCountdown > 0 ||
                      !emailOtpAvailable
                    }
                  >
                    <ShieldCheck size={17} />
                    {otpCountdown > 0
                      ? `Send again in ${otpCountdown}s`
                      : otpSent
                        ? "Resend to email"
                        : "Send OTP to email"}
                  </button>
                )}

                {otpSent && (
                  <label className="register-field">
                    <span>Verification code</span>
                    <div className="register-input">
                      <ShieldCheck size={18} />
                      <input
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        maxLength="6"
                        placeholder="6 digit OTP"
                        type="text"
                        value={enteredOtp}
                        onChange={(event) => setEnteredOtp(event.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                    {errors.otp && <small>{errors.otp}</small>}
                  </label>
                )}
              </section>

              <div className="register-form__row">
                <label className="register-field">
                  <span>Password</span>
                  <div className="register-input">
                    <Lock size={18} />
                    <input
                      name="password"
                      placeholder="Create password"
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={updateField}
                    />
                    <button
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="register-icon-btn"
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="register-strength" data-score={passwordStrength.score}>
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <em>{passwordStrength.label}</em>
                  {errors.password && <small>{errors.password}</small>}
                </label>

                <label className="register-field">
                  <span>Confirm password</span>
                  <div className="register-input">
                    <Lock size={18} />
                    <input
                      name="confirmPassword"
                      placeholder="Repeat password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={updateField}
                    />
                    <button
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      className="register-icon-btn"
                      type="button"
                      onClick={() => setShowConfirmPassword((visible) => !visible)}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.confirmPassword && <small>{errors.confirmPassword}</small>}
                </label>
              </div>

              <div className="register-form__row">
                <label className="register-field">
                  <span>Gender</span>
                  <select name="gender" value={form.gender} onChange={updateField}>
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  {errors.gender && <small>{errors.gender}</small>}
                </label>

                <label className="register-field">
                  <span>Account type</span>
                  <select name="role" value={form.role} onChange={updateField}>
                    <option value="customer">Customer</option>
                    <option value="seller">Seller</option>
                  </select>
                </label>
              </div>

              <button className="register-submit" type="submit" disabled={loading}>
                <span>{loading ? "Creating account..." : "Create account"}</span>
                <ArrowRight size={18} />
              </button>
            </form>

            <p className="register-login">
              Already have an account?
              <Link to="/login">Login</Link>
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default Register;
