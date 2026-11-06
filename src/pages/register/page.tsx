import { useState, type FormEvent, useEffect } from "react";
import { useClerk, useAuth } from "@clerk/react";
import { useNavigate, Link } from "react-router-dom";
import zxcvbn from "zxcvbn";
import { toast } from "sonner";

const TEAM_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDmm3YMblp1Ns_cwXDgMdQuktUhbDYitGw7oU_UpWk3KocveTS25Y1I5r9Qhud_SeWCTtfls1s2jNgmUGXeeZi1C5lG6Hdb0LiNsuXzvlA1VQvpnNRlDSIV2NnQ0-hWiu1hazth7W8V3TeoswBBefgml9n-ftPsF_vV_fRt0MACIFt-3I2jSO4UAuYD1vOsJZDjknyln9a32uiKysKbJcwMuCR7OYd4LqO0rVAVJsexLdTA0R40nTjeeTA2vKnpzTJLQWUlnKJ3ThUT";

export default function RegisterPage() {
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const navigate = useNavigate();

  useEffect(() => {
    if (isSignedIn) {
      navigate("/");
    }
  }, [isSignedIn, navigate]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  const passwordResult = password.length > 0 ? zxcvbn(password) : null;
  const passwordScore = passwordResult?.score ?? 0;
  const passwordFeedback = passwordResult?.feedback?.suggestions?.[0] ?? "";
  const passwordWarning = passwordResult?.feedback?.warning ?? "";

  const SCORE_LABELS = ["Weak", "Fair", "Good", "Strong", "Very Strong"];
  const SCORE_COLORS = ["bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-secondary", "bg-secondary"];
  const SCORE_TEXT_COLORS = ["text-red-600", "text-orange-500", "text-yellow-600", "text-secondary", "text-secondary"];

  const isPasswordStrong = passwordScore >= 2;
  const borderStyle = password.length === 0
    ? "border-outline"
    : isPasswordStrong
      ? "border-secondary"
      : "border-error";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      return toast.error("Please enter your full name");
    }
    if (!email.trim() || !email.includes("@")) {
      return toast.error("Please enter a valid email address");
    }
    // The server lets in verified company addresses only (server/lib/access.ts); say so before Clerk sends a code.
    if (!email.trim().toLowerCase().endsWith("@career141.com")) {
      return toast.error("Use your @career141.com work email to create an account.");
    }
    if (password.length < 8) {
      return toast.error("Password must be at least 8 characters long");
    }
    if (!isPasswordStrong) {
      return toast.error("Please choose a stronger password");
    }
    if (!agreeTerms) {
      return toast.error("You must agree to the Terms of Use and Privacy Policy");
    }

    setLoading(true);
    try {
      const signUpAttempt = await clerk.client.signUp.create({
        emailAddress: email,
        password,
      });
      if (signUpAttempt.status === "complete") {
        toast.success("Account created successfully!");
        navigate("/login");
      } else {
        await signUpAttempt.prepareEmailAddressVerification({ strategy: "email_code" });
        setPendingVerification(true);
        toast.success("Verification code sent to your email!");
      }
    } catch (err: any) {
      const errorMessage = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || "Registration failed";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (verificationCode.length !== 6) {
      return toast.error("Please enter a valid 6-digit verification code");
    }

    setLoading(true);
    try {
      const signUpAttempt = await clerk.client.signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });
      if (signUpAttempt.status === "complete") {
        toast.success("Email verified successfully! Welcome to Career141.");
        navigate("/login");
      } else {
        toast.error("Verification failed. Please try again.");
      }
    } catch (err: any) {
      const errorMessage = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || "Verification failed";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <span className="text-headline-lg font-bold text-primary" style={{ fontFamily: "Manrope" }}>CAREER141</span>
            <h2 className="text-headline-md text-primary mt-6 mb-2" style={{ fontFamily: "Manrope" }}>Check your email</h2>
            <p className="text-body-md text-on-surface-variant" style={{ fontFamily: "Manrope" }}>
              We sent a verification code to <strong className="text-primary">{email}</strong>
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-6">
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="Enter verification code"
              required
              className="w-full px-4 py-3 rounded-lg border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all text-body-lg text-center tracking-[0.5em] placeholder:tracking-normal"
              maxLength={6}
            />
            <button
              type="submit"
              disabled={loading || verificationCode.length === 0}
              className="w-full bg-primary text-on-primary text-label-md font-semibold py-4 rounded-full hover:shadow-lg active:scale-95 transition-all duration-200 disabled:opacity-60"
            >
              {loading ? "Verifying..." : "Verify email"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-grow flex flex-col md:flex-row">
        <section className="hidden md:flex md:w-1/2 bg-mint-gradient relative items-center justify-center p-margin-desktop overflow-hidden">
          <div className="absolute top-margin-desktop left-margin-desktop">
            <span className="text-headline-lg font-bold text-primary" style={{ fontFamily: "Manrope" }}>CAREER141</span>
          </div>
          <div className="absolute inset-0 pointer-events-none opacity-20">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary-container rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-secondary-container rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2" />
          </div>
          <div className="relative z-10 max-w-md">
            <div className="rounded-xl border shadow-[0px_12px_32px_rgba(0,0,0,0.05)] bg-surface-container-low p-margin-mobile border-outline-variant">
              <div className="flex items-center gap-2 mb-6">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className="material-symbols-outlined text-primary text-[20px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                  ))}
                </div>
                <span className="text-label-md font-semibold text-on-surface">4.9/5 Rating</span>
              </div>
              <h2 className="text-headline-lg text-primary mb-4 leading-tight" style={{ fontFamily: "Manrope" }}>
                Join 500,000+ businesses growing with CAREER141.
              </h2>
              <p className="text-body-lg text-on-surface-variant mb-8" style={{ fontFamily: "Manrope" }}>
                The all-in-one platform to manage your customer relationships across email, SMS, and chat.
              </p>
              <div className="relative h-64 w-full rounded-lg overflow-hidden border border-outline-variant">
                <img
                  alt="Business Team Collaborating"
                  className="w-full h-full object-cover"
                  src={TEAM_IMAGE}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="w-full md:w-1/2 bg-white flex items-center justify-center p-margin-mobile md:p-margin-desktop overflow-y-auto">
          <div className="w-full max-w-md py-8">
            <div className="md:hidden mb-12">
              <span className="text-headline-lg font-bold text-primary" style={{ fontFamily: "Manrope" }}>CAREER141</span>
            </div>

            <div className="mb-8">
              <h1 className="text-headline-lg text-primary mb-2" style={{ fontFamily: "Manrope" }}>Create your free account</h1>
              <p className="text-body-lg text-on-surface-variant" style={{ fontFamily: "Manrope" }}>Step into the future of mail management.</p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label className="block text-label-md font-semibold text-on-surface mb-2" htmlFor="full_name">Full Name</label>
                <input
                  id="full_name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                  className="w-full px-4 py-3 rounded-lg border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all text-body-lg placeholder:text-on-surface-variant/50"
                />
              </div>

              <div>
                <label className="block text-label-md font-semibold text-on-surface mb-2" htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="w-full px-4 py-3 rounded-lg border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all text-body-lg placeholder:text-on-surface-variant/50"
                />
              </div>

              <div>
                <label className="block text-label-md font-semibold text-on-surface mb-2" htmlFor="password">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className={`w-full px-4 py-3 rounded-lg border focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all text-body-lg placeholder:text-on-surface-variant/50 pr-12 ${borderStyle}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>

                {password.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            level <= passwordScore ? SCORE_COLORS[passwordScore] : "bg-gray-200"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-label-sm">
                      <span className={`font-medium ${SCORE_TEXT_COLORS[passwordScore]}`}>
                        {SCORE_LABELS[passwordScore]}
                      </span>
                      {passwordScore >= 2 && (
                        <span className="text-secondary text-label-sm font-medium">Strong enough ✓</span>
                      )}
                    </div>
                    {passwordFeedback && passwordScore < 2 && (
                      <p className="text-label-sm text-error mt-0.5">{passwordFeedback}</p>
                    )}
                    {passwordWarning && passwordScore < 2 && (
                      <p className="text-label-sm text-on-surface-variant mt-0.5">{passwordWarning}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-start gap-3">
                <div className="flex items-center h-5">
                  <input
                    id="terms"
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary/20 cursor-pointer"
                  />
                </div>
                <label className="text-body-sm text-on-surface-variant" htmlFor="terms">
                  I agree to the{" "}
                  <a className="text-primary font-semibold hover:underline" href="#">Terms of Use</a>{" "}
                  and acknowledge the{" "}
                  <a className="text-primary font-semibold hover:underline" href="#">Privacy Policy</a>.
                </label>
              </div>

              <div id="clerk-captcha" className="my-4" />

              <button
                type="submit"
                disabled={loading || (password.length > 0 && !isPasswordStrong)}
                className="w-full bg-primary text-on-primary text-label-md font-semibold py-4 rounded-full hover:shadow-lg active:scale-95 transition-all duration-200 disabled:opacity-60"
              >
                {loading ? "Creating account..." : "Get started now"}
              </button>
            </form>

            <p className="mt-10 text-center text-body-sm text-on-surface-variant">
              Already have an account?{" "}
              <Link to="/login" className="text-primary font-bold hover:underline transition-all">
                Sign in here
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="bg-surface border-t border-outline-variant py-margin-mobile px-margin-desktop w-full">
        <div className="max-w-max-width mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-body-sm text-on-surface-variant opacity-80">
            &copy; 2024 CAREER141. All rights reserved.
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            {["Terms of Use", "Privacy Policy", "Cookie Settings", "Security"].map((item) => (
              <a
                key={item}
                href="#"
                className="text-body-sm text-on-surface-variant hover:text-primary underline transition-all opacity-80 hover:opacity-100"
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
