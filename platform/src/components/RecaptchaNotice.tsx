import { withOutboundUtm } from "@/lib/utm";

/**
 * Required reCAPTCHA branding.
 *
 * Google's terms permit hiding the floating badge only if this exact
 * attribution is visible in the user flow. The badge is hidden in globals.css
 * because it is fixed bottom-right and collides with the mobile nav bar, so
 * this text is not optional — remove it and the integration is out of
 * compliance.
 *
 * Shared component: rendered from server pages (home, /weekly) and client ones
 * (/login, /signup). The env var is read inline rather than imported from
 * lib/recaptchaClient because that module is "use client" — importing a plain
 * function from it into a server render turns it into a client reference proxy
 * and throws. NEXT_PUBLIC_* is inlined at build time and safe in both.
 */
export function RecaptchaNotice({ className = "" }: { className?: string }) {
  if (!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) return null;

  return (
    <p className={`text-[11px] leading-relaxed text-muted-foreground ${className}`}>
      Protected by reCAPTCHA. The Google{" "}
      <a
        href={withOutboundUtm("https://policies.google.com/privacy", {
          campaign: "recaptcha_notice",
        })}
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-foreground"
      >
        Privacy Policy
      </a>{" "}
      and{" "}
      <a
        href={withOutboundUtm("https://policies.google.com/terms", {
          campaign: "recaptcha_notice",
        })}
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-foreground"
      >
        Terms of Service
      </a>{" "}
      apply.
    </p>
  );
}
