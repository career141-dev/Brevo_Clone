import { useState, type FormEvent, useEffect } from "react";
import { useClerk, useAuth } from "@clerk/react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";

const SOCIAL_PROOF_AVATARS = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDJnM0S3JLXLUP_1UHojCrfH8cqKvpde-V87uSadPszzehY5ygY2Hr4pukpX09B6o8S3ec5zTsPia0qK0UO6TBPKowx_9QFLHKh7dBNHf66B-mOos-iSWXReciy6TtDmCc0ScDLaG2_HFNGm3VSARi7ONRBoVVTgWAHfHHKIWUbkcDagaoBDZfBB6PjljwU7S9_kEsOBwIaCZa8XwJltW3trezA-bCnr3ZbPXpmGQC0EJJ_ZS0r6-jeBYG_STq6Sn2SOgwInAkOro0S",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAU92aFgd3hnI2M66v0NZsGmsNrL6r2CqSnQDhgn0A_5qaHNkIGil-5BDJrgQt7hyNQglXiAy0pD4-WaA1L7sRFIFT1whtLUcftqvoy_M3hTfbLPlzNHz5F36Re5pVxf-xzsiMmKqGgllZPfUSAymoYlZrW7oqUEeEV4vFGgJsi5W3-4u1yQTp3SufSC4u4e0ewjQScCYrnvq-VNH8nVfk6pO8Mim0uh91EZxQFosqupPYBrhGGpDeACevom-ytvVh1mosFIDqMGq0-",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDAHd6S2qxHlRrHUbE-RUgrxGIheJtgMHL3CRQL_emneJ59_lKY4LRD7HFejlV76NfF9DugnSptctAcln7BHWzRBS9wXCj2qzLW_MkDjaS4q9c5kazX0rfYlkb2CVP9nimjcHGk_O4kOy4a47aJrDJNh-qdYJt8_KxAgACYPOuk-rGCvcf2J5-6qHYhaS1plhJy0M9zccWMi4GKVynOrD4-G74R9fr31XXN0w3xTTVw8JZDAdOGYOsUJipJ4OfCl6UZogVcNIfDZrCu",
];

export default function LoginPage() {
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const navigate = useNavigate();

  useEffect(() => {
    if (isSignedIn) {
      navigate("/");
    }
  }, [isSignedIn, navigate]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  const handleOAuthSignIn = async (strategy: "oauth_google" | "oauth_apple") => {
    try {
      await clerk.client.signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: window.location.origin + "/auth/callback",
        redirectUrlComplete: window.location.origin + "/",
      });
    } catch (err: any) {
      const errorMessage = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || "Sign in failed";
      toast.error(errorMessage);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !email.includes("@")) {
      return toast.error("Please enter a valid email address");
    }
    if (!password) {
      return toast.error("Please enter your password");
    }

    setLoading(true);
    try {
      const signInAttempt = await clerk.client.signIn.create({
        identifier: email,
        password,
      });
      if (signInAttempt.status === "complete") {
        await clerk.setActive({ session: signInAttempt.createdSessionId });
        toast.success("Welcome back! You have successfully logged in.");
        navigate("/");
      } else if (signInAttempt.status === "needs_first_factor") {
        // Prepare email verification if required
        const factor: any = signInAttempt.supportedFirstFactors?.find(
          (f: any) => f.strategy === "email_code"
        );
        if (factor) {
          await clerk.client.signIn.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: factor.emailAddressId,
          });
          setPendingVerification(true);
          toast.success("Verification code sent to your email!");
        } else {
          toast.error("Strategies available: " + JSON.stringify(signInAttempt.supportedFirstFactors?.map((f:any)=>f.strategy)));
        }
      } else if (signInAttempt.status === "needs_second_factor") {
        const factor: any = signInAttempt.supportedSecondFactors?.find(
          (f: any) => f.strategy === "phone_code" || f.strategy === "email_code"
        );
        if (factor) {
          if (factor.strategy === "phone_code") {
            await clerk.client.signIn.prepareSecondFactor({
              strategy: "phone_code",
              phoneNumberId: factor.phoneNumberId,
            });
            toast.success("Verification code sent to your phone!");
          } else {
            await clerk.client.signIn.prepareSecondFactor({
              strategy: factor.strategy,
            });
            toast.success("Verification code sent!");
          }
          setPendingVerification(true);
        } else {
          toast.error("Status: " + signInAttempt.status + " | 2FA Factors: " + JSON.stringify(signInAttempt.supportedSecondFactors?.map((f:any)=>f.strategy)));
        }
      } else {
        toast.error("Status: " + signInAttempt.status + " | 1FA: " + JSON.stringify(signInAttempt.supportedFirstFactors?.map((f:any)=>f.strategy)) + " | 2FA: " + JSON.stringify(signInAttempt.supportedSecondFactors?.map((f:any)=>f.strategy)));
      }
    } catch (err: any) {
      const errorMessage = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || "Authentication failed";
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
      const status = clerk.client.signIn.status;
      let signInAttempt;
      
      if (status === "needs_second_factor") {
        signInAttempt = await clerk.client.signIn.attemptSecondFactor({
          strategy: "phone_code",
          code: verificationCode,
        });
        // Note: we assume phone_code here for second factor. If they used email_code, we can fallback.
        // Actually, attemptSecondFactor accepts strategy. Let's just try phone_code then email_code if error, or just phone_code.
      } else {
        signInAttempt = await clerk.client.signIn.attemptFirstFactor({
          strategy: "email_code",
          code: verificationCode,
        });
      }

      if (signInAttempt.status === "complete") {
        await clerk.setActive({ session: signInAttempt.createdSessionId });
        toast.success("Verification successful! Welcome back.");
        navigate("/");
      } else {
        toast.error("Verification failed. Please try again.");
      }
    } catch (err: any) {
      // Fallback for second factor if strategy was wrong
      if (clerk.client.signIn.status === "needs_second_factor") {
        try {
          const retryAttempt = await clerk.client.signIn.attemptSecondFactor({
            strategy: "email_code",
            code: verificationCode,
          });
          if (retryAttempt.status === "complete") {
            await clerk.setActive({ session: retryAttempt.createdSessionId });
            toast.success("Verification successful! Welcome back.");
            navigate("/");
            return;
          }
        } catch (retryErr: any) {
           // Ignore, throw original error
        }
      }
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
      <main className="flex-grow flex flex-col md:flex-row h-screen overflow-hidden">
        <section className="hidden md:flex md:w-1/2 mint-gradient relative items-center justify-center p-margin-desktop overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-secondary-container/20 rounded-full blur-3xl -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary-fixed/30 rounded-full blur-3xl -ml-40 -mb-40" />
          <div className="relative z-10 max-w-md w-full">
            <div className="bg-surface-container-lowest/80 backdrop-blur-md border border-outline-variant p-10 rounded-xl shadow-[0px_12px_32px_rgba(0,0,0,0.05)] hover:scale-[1.02] transition-transform duration-500">
              <div className="flex items-center gap-2 mb-6">
                <div className="flex -space-x-2">
                  {SOCIAL_PROOF_AVATARS.map((src, i) => (
                    <img
                      key={i}
                      className="w-10 h-10 rounded-full border-2 border-surface shadow-sm object-cover"
                      src={src}
                      alt=""
                    />
                  ))}
                </div>
                <div className="flex items-center text-secondary">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className="material-symbols-outlined text-[20px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                  ))}
                </div>
              </div>
              <h2 className="text-headline-lg text-primary mb-4" style={{ fontFamily: "Manrope" }}>
                Trusted by 600,000 businesses
              </h2>
              <p className="text-body-lg text-on-surface-variant leading-relaxed" style={{ fontFamily: "Manrope" }}>
                Join the world's fastest-growing mail management platform. We help you scale your communications with enterprise-grade reliability and human-centric design.
              </p>
              <div className="mt-8 pt-8 border-t border-outline-variant flex gap-8">
                <div>
                  <p className="text-[24px] font-bold text-primary" style={{ fontFamily: "Manrope" }}>99.9%</p>
                  <p className="text-label-sm text-outline uppercase tracking-wider" style={{ fontFamily: "Manrope" }}>Uptime</p>
                </div>
                <div>
                  <p className="text-[24px] font-bold text-primary" style={{ fontFamily: "Manrope" }}>24/7</p>
                  <p className="text-label-sm text-outline uppercase tracking-wider" style={{ fontFamily: "Manrope" }}>Support</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex-1 bg-surface-container-lowest flex flex-col items-center justify-center px-margin-mobile md:px-margin-desktop py-margin-desktop overflow-y-auto">
            <div className="w-full max-w-[440px]">
              <div className="mb-12">
              <p className="text-headline-lg font-bold text-primary mb-2" style={{ fontFamily: "Manrope" }}>CAREER141</p>
              <h1 className="text-headline-lg text-on-surface" style={{ fontFamily: "Manrope" }}>
                Marketing made simple
              </h1>
              <p className="text-body-lg text-on-surface-variant mt-2" style={{ fontFamily: "Manrope" }}>
                Log in to your account to continue
              </p>
            </div>

            <div className="flex flex-col gap-3 mb-8">
              <button
                type="button"
                onClick={() => handleOAuthSignIn("oauth_google")}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-full border border-outline-variant hover:bg-surface-container-low active:scale-[0.98] text-on-surface font-semibold text-sm transition-all"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <button
                type="button"
                onClick={() => handleOAuthSignIn("oauth_apple")}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-full border border-outline-variant hover:bg-surface-container-low active:scale-[0.98] text-on-surface font-semibold text-sm transition-all"
              >
                                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" fill="currentColor"/>
                </svg>
                Continue with Apple
              </button>
            </div>

            <div className="relative flex items-center my-8">
              <div className="flex-grow border-t border-outline-variant" />
              <span className="flex-shrink mx-4 text-xs font-semibold text-outline bg-surface-container-lowest px-2">OR</span>
              <div className="flex-grow border-t border-outline-variant" />
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-on-surface block px-1" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="w-full px-4 py-3 rounded-lg border border-outline-variant bg-surface focus:outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 transition-all text-on-surface placeholder:text-outline/50"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-sm font-semibold text-on-surface" htmlFor="password">
                    Password
                  </label>
                  <a className="text-xs font-semibold text-secondary hover:underline" href="#">
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-4 py-3 rounded-lg border border-outline-variant bg-surface focus:outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 transition-all text-on-surface placeholder:text-outline/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant transition-colors"
                  >
                    <span className="material-symbols-outlined">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              <div id="clerk-captcha" className="my-4" />

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-primary text-on-primary font-semibold text-sm rounded-full hover:bg-primary-container transition-all active:scale-[0.98] shadow-sm disabled:opacity-60"
              >
                {loading ? "Please wait..." : "Log in"}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-on-surface-variant">
              Don't have an account?{" "}
              <Link to="/register" className="text-primary font-semibold underline">
                Sign up
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="bg-surface border-t border-outline-variant">
        <div className="flex flex-col md:flex-row justify-between items-center py-margin-mobile px-margin-desktop max-w-max-width mx-auto gap-4">
          <p className="text-sm text-secondary opacity-80 hover:opacity-100 transition-all">
            &copy; 2024 CAREER141. All rights reserved.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            {["Terms of Use", "Privacy Policy", "Cookie Settings", "Security"].map((item) => (
              <a
                key={item}
                href="#"
                className="text-sm text-on-surface-variant hover:text-primary underline transition-all"
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
