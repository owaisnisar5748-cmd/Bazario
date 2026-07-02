import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import { authApi } from "../services/api";
import { getAuthToken, getRoleHome, getSafeRedirectPath, getStoredUser, storeSession } from "../services/auth";
import "./Login.css";

const slides = [
  {
    image: "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=1600&q=80",
    label: "Everything together",
    title: "Four focused worlds. One account.",
    text: "Move easily between clothes, electronics, cosmetics, and medicines.",
  },
  {
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1600&q=80",
    label: "Curated technology",
    title: "Useful finds, without the endless scroll.",
    text: "Pick up where you left off and keep every order in one clear place.",
  },
  {
    image: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1600&q=80",
    label: "Built for both sides",
    title: "Your marketplace, ready when you are.",
    text: "Shop confidently or step straight back into your seller workspace.",
  },
];

function Login() {
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isShowcasePaused, setIsShowcasePaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetErrors, setResetErrors] = useState({});
  const [resetStatus, setResetStatus] = useState(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user || !getAuthToken()) return;

    navigate(getRoleHome(user), { replace: true });
  }, [navigate]);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isShowcasePaused || prefersReducedMotion) return undefined;

    const interval = setInterval(() => {
      setCurrentSlide((previous) => (previous + 1) % slides.length);
    }, 5500);

    return () => clearInterval(interval);
  }, [isShowcasePaused]);

  useEffect(() => {
    if (!resetCountdown) return undefined;

    const timer = setTimeout(() => {
      setResetCountdown((seconds) => seconds - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [resetCountdown]);

  const selectSlide = (index) => {
    setCurrentSlide((index + slides.length) % slides.length);
  };

  const validate = () => {
    const nextErrors = {};
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email.trim())) nextErrors.email = "Enter a valid email address.";
    if (!password) nextErrors.password = "Enter your password.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const login = async (event) => {
    event.preventDefault();
    setStatus(null);

    if (!validate()) return;

    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await authApi.login(normalizedEmail, password);
      const user = response.data.user || { username: normalizedEmail, role: "customer" };
      const requestedPath = location.state?.from;

      storeSession(response.data.access_token, user);
      navigate(getSafeRedirectPath(user, requestedPath), {
        replace: true,
      });
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
            ? "Bazario reached the API, but login is not available at that route. Check the frontend backend proxy setting."
            : null) ||
          (statusCode
            ? `Sign in failed with server status ${statusCode}. Please try again shortly.`
            : null) ||
          (error.code === "ECONNABORTED"
            ? "Bazario is taking longer than expected. Please try again in a moment."
            : "Bazario sign in is temporarily unavailable. Please try again shortly."),
      });
      setLoading(false);
    }
  };

  const openRecovery = () => {
    setResetEmail(email.trim().toLowerCase());
    setResetStatus(null);
    setResetErrors({});
    setIsRecovering(true);
  };

  const closeRecovery = () => {
    setIsRecovering(false);
    setResetLoading(false);
    setResetCode("");
    setNewPassword("");
    setConfirmPassword("");
    setResetCodeSent(false);
    setResetCountdown(0);
    setResetErrors({});
    setResetStatus(null);
  };

  const requestResetCode = async () => {
    const normalizedEmail = resetEmail.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
      setResetErrors({ email: "Enter a valid email address." });
      return;
    }

    setResetLoading(true);
    setResetStatus(null);

    try {
      const response = await authApi.requestPasswordReset(normalizedEmail);
      setResetEmail(normalizedEmail);
      setResetCodeSent(true);
      setResetCountdown(30);
      setResetErrors({});
      setResetStatus({
        type: "success",
        message: response.data.dev_otp
          ? `Development reset code: ${response.data.dev_otp}`
          : response.data.message,
      });
    } catch (error) {
      setResetStatus({
        type: "error",
        message: error.response?.data?.detail || "Could not send a reset code. Try again shortly.",
      });
    } finally {
      setResetLoading(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    const nextErrors = {};

    if (!/^\d{6}$/.test(resetCode)) nextErrors.code = "Enter the six-digit reset code.";
    if (newPassword.length < 8) nextErrors.password = "Use at least eight characters.";
    if (newPassword !== confirmPassword) nextErrors.confirmPassword = "Passwords do not match.";

    setResetErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setResetLoading(true);
    setResetStatus(null);

    try {
      const response = await authApi.resetPassword(resetEmail, resetCode, newPassword);
      setEmail(resetEmail);
      closeRecovery();
      setStatus({ type: "success", message: response.data.message });
    } catch (error) {
      setResetStatus({
        type: "error",
        message: error.response?.data?.detail || "Could not reset your password. Try again shortly.",
      });
      setResetLoading(false);
    }
  };

  return (
    <div className="login-page">
      <main className="login-shell">
        <section
          className="login-showcase"
          onMouseEnter={() => setIsShowcasePaused(true)}
          onMouseLeave={() => setIsShowcasePaused(false)}
          onFocus={() => setIsShowcasePaused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsShowcasePaused(false);
          }}
          aria-label="Bazario marketplace showcase"
        >
          <img src={slides[currentSlide].image} alt="" className="login-showcase__image" />
          <div className="login-showcase__shade" />

          <Link className="login-brand" to="/" aria-label="Bazario home">
            <span className="login-brand__mark">B</span>
            <span>
              <strong>Bazario</strong>
              <small>A considered marketplace</small>
            </span>
          </Link>

          <div className="login-showcase__copy">
            <p>{slides[currentSlide].label}</p>
            <h1>{slides[currentSlide].title}</h1>
            <span>{slides[currentSlide].text}</span>
          </div>

          <div className="login-showcase__controls">
            <div className="login-showcase__dots" aria-label="Choose showcase slide">
              {slides.map((slide, index) => (
                <button
                  type="button"
                  key={slide.label}
                  className={index === currentSlide ? "is-active" : ""}
                  aria-label={`Show slide ${index + 1}: ${slide.label}`}
                  aria-current={index === currentSlide ? "true" : undefined}
                  onClick={() => selectSlide(index)}
                />
              ))}
            </div>
            <div className="login-showcase__arrows">
              <button type="button" aria-label="Previous slide" onClick={() => selectSlide(currentSlide - 1)}>
                <ArrowLeft size={18} />
              </button>
              <span>{String(currentSlide + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
              <button type="button" aria-label="Next slide" onClick={() => selectSlide(currentSlide + 1)}>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </section>

        <section className="login-panel" aria-labelledby="login-heading">
          <div className="login-panel__wash" />
          <div className="login-card">
            <Link className="login-back" to="/">
              <ArrowLeft size={16} />
              Back to marketplace
            </Link>

            <div className="login-card__eyebrow">
              {isRecovering ? <KeyRound size={16} /> : <ShieldCheck size={16} />}
              {isRecovering ? "Account recovery" : "Secure account access"}
            </div>

            <header className="login-card__header">
              <h2 id="login-heading">
                {isRecovering ? <>Reset <em>password.</em></> : <>Welcome <em>back.</em></>}
              </h2>
              <p>
                {isRecovering
                  ? "We will email you a secure six-digit code to confirm it is really you."
                  : "Sign in to continue shopping or manage your seller workspace."}
              </p>
            </header>

            {!isRecovering && (
              <div className="login-assurances" aria-label="Account benefits">
                <span><Check size={14} /> Orders in one place</span>
                <span><Check size={14} /> Role-aware access</span>
              </div>
            )}

            {!isRecovering && status && (
              <div className={`login-alert login-alert--${status.type}`} role="alert">
                {status.message}
              </div>
            )}

            {isRecovering && resetStatus && (
              <div className={`login-alert login-alert--${resetStatus.type}`} role="status">
                {resetStatus.message}
              </div>
            )}

            {!isRecovering ? (
            <form className="login-form" onSubmit={login} noValidate>
              <label className="login-field" htmlFor="login-email">
                <span>Email address</span>
              </label>
              <div className={`login-input ${errors.email ? "is-invalid" : ""}`}>
                <Mail size={18} />
                <input
                  id="login-email"
                  name="email"
                  autoComplete="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "login-email-error" : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setErrors((current) => ({ ...current, email: "" }));
                  }}
                />
              </div>
              {errors.email && <small id="login-email-error" className="login-error">{errors.email}</small>}

              <div className="login-field-row">
                <label className="login-field" htmlFor="login-password">
                  <span>Password</span>
                </label>
                <button type="button" className="login-forgot" onClick={openRecovery}>
                  Forgot password?
                </button>
              </div>
              <div className={`login-input ${errors.password ? "is-invalid" : ""}`}>
                <Lock size={18} />
                <input
                  id="login-password"
                  name="password"
                  autoComplete="current-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "login-password-error" : undefined}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors((current) => ({ ...current, password: "" }));
                  }}
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="login-icon-btn"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <small id="login-password-error" className="login-error">{errors.password}</small>}

              <button className="login-submit" type="submit" disabled={loading}>
                <span>{loading ? "Signing you in..." : "Sign in to Bazario"}</span>
                <ArrowRight size={18} />
              </button>
            </form>
            ) : (
              <form className="login-form login-recovery" onSubmit={resetPassword} noValidate>
                <label className="login-field" htmlFor="reset-email">
                  <span>Account email</span>
                </label>
                <div className={`login-input login-input--action ${resetErrors.email ? "is-invalid" : ""}`}>
                  <Mail size={18} />
                  <input
                    id="reset-email"
                    name="resetEmail"
                    autoComplete="email"
                    type="email"
                    placeholder="you@example.com"
                    value={resetEmail}
                    disabled={resetCodeSent}
                    onChange={(event) => {
                      setResetEmail(event.target.value);
                      setResetErrors((current) => ({ ...current, email: "" }));
                    }}
                  />
                  <button
                    type="button"
                    onClick={requestResetCode}
                    disabled={resetLoading || resetCountdown > 0}
                  >
                    {resetCountdown > 0 ? `${resetCountdown}s` : resetCodeSent ? "Resend" : "Send code"}
                  </button>
                </div>
                {resetErrors.email && <small className="login-error">{resetErrors.email}</small>}

                {resetCodeSent && (
                  <>
                    <label className="login-field" htmlFor="reset-code">
                      <span>Reset code</span>
                    </label>
                    <div className={`login-input ${resetErrors.code ? "is-invalid" : ""}`}>
                      <KeyRound size={18} />
                      <input
                        id="reset-code"
                        name="resetCode"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        maxLength="6"
                        type="text"
                        placeholder="Six-digit code"
                        value={resetCode}
                        onChange={(event) => {
                          setResetCode(event.target.value.replace(/\D/g, ""));
                          setResetErrors((current) => ({ ...current, code: "" }));
                        }}
                      />
                    </div>
                    {resetErrors.code && <small className="login-error">{resetErrors.code}</small>}

                    <label className="login-field" htmlFor="reset-password">
                      <span>New password</span>
                    </label>
                    <div className={`login-input ${resetErrors.password ? "is-invalid" : ""}`}>
                      <Lock size={18} />
                      <input
                        id="reset-password"
                        name="newPassword"
                        autoComplete="new-password"
                        type="password"
                        placeholder="At least eight characters"
                        value={newPassword}
                        onChange={(event) => {
                          setNewPassword(event.target.value);
                          setResetErrors((current) => ({ ...current, password: "" }));
                        }}
                      />
                    </div>
                    {resetErrors.password && <small className="login-error">{resetErrors.password}</small>}

                    <label className="login-field" htmlFor="confirm-reset-password">
                      <span>Confirm new password</span>
                    </label>
                    <div className={`login-input ${resetErrors.confirmPassword ? "is-invalid" : ""}`}>
                      <Lock size={18} />
                      <input
                        id="confirm-reset-password"
                        name="confirmPassword"
                        autoComplete="new-password"
                        type="password"
                        placeholder="Repeat new password"
                        value={confirmPassword}
                        onChange={(event) => {
                          setConfirmPassword(event.target.value);
                          setResetErrors((current) => ({ ...current, confirmPassword: "" }));
                        }}
                      />
                    </div>
                    {resetErrors.confirmPassword && (
                      <small className="login-error">{resetErrors.confirmPassword}</small>
                    )}

                    <button className="login-submit" type="submit" disabled={resetLoading}>
                      <span>{resetLoading ? "Updating password..." : "Update password"}</span>
                      <ArrowRight size={18} />
                    </button>
                  </>
                )}
              </form>
            )}

            {isRecovering ? (
              <button type="button" className="login-recovery-back" onClick={closeRecovery}>
                <ArrowLeft size={15} />
                Return to sign in
              </button>
            ) : (
              <p className="login-register">
                New to Bazario?
                <Link to="/register">Create an account</Link>
              </p>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default Login;
