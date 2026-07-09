import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Privacy policy + cookie notice.
 *
 * DRAFT — the technical disclosures below reflect what the app actually does
 * (verified against the codebase), but every [PLACEHOLDER] is an operator- or
 * legal-specific fact that MUST be filled in and the whole document reviewed
 * by a qualified person before launch. See TODO.md.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-base font-semibold text-surface-800">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-surface-600">{children}</div>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface-50">
      <header className="border-b border-surface-200 bg-white dark:bg-surface-100">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <Link to="/" className="text-surface-400 hover:text-surface-600" title="Back">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold text-surface-900">Privacy Policy</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <p className="mb-8 text-xs text-surface-400">
          Last updated: [PLACEHOLDER — date]. This policy describes how RAMSey
          (&quot;the service&quot;), operated by [PLACEHOLDER — legal entity name and
          address], processes your data. Contact: [PLACEHOLDER — privacy contact email].
        </p>

        <Section title="What data we process">
          <p>
            <strong>Account data.</strong> Your email address, optional display name, optional
            profile picture, and a hashed password (or your Google account identifier if you sign
            in with Google). Used to authenticate you and operate your account.
          </p>
          <p>
            <strong>Content you create.</strong> Projects, diagrams, snapshots, comments, and team
            memberships. Diagrams may be shared with collaborators you or your team choose;
            content you have shared remains visible to those collaborators even after you delete
            your account (your identity is removed from it).
          </p>
          <p>
            <strong>AI assistant data.</strong> If you use the AI chat, your chat messages and the
            content of the currently open diagram are sent to Anthropic (Claude) to generate
            responses. We record the token volume of each AI request (not the content) to enforce
            usage limits.
          </p>
          <p>
            <strong>Technical data.</strong> Server logs (IP address, request metadata) for
            security and rate limiting; audit log entries for account and project actions; error
            reports (via Sentry) if error tracking is enabled, which may include request context.
          </p>
        </Section>

        <Section title="What we do NOT do">
          <p>
            We do not sell your data, run advertising, or use third-party analytics. AI chat is
            only invoked when you actively use it — diagrams are not sent to Anthropic otherwise.
          </p>
        </Section>

        <Section title="Cookies and local storage">
          <p>
            We use a single, strictly necessary cookie — <code>ramsey_token</code> — to keep you
            signed in (HttpOnly, expires after 7 days). Because it is essential for the service
            and we use no advertising or analytics cookies, no cookie consent banner is required;
            this notice serves as disclosure.
          </p>
          <p>
            Your browser&apos;s local storage holds convenience data that never leaves your device
            through us: your theme preference, a guest identifier (when using the app without an
            account), locally cached analysis results, and diagrams created in guest mode.
          </p>
        </Section>

        <Section title="Who processes your data (subprocessors)">
          <p>The service relies on the following processors:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Anthropic</strong> (AI chat responses) — receives chat messages and open
              diagram content when you use the AI assistant. [PLACEHOLDER — confirm DPA /
              zero-data-retention tier and link Anthropic&apos;s commercial terms.]
            </li>
            <li>
              <strong>[PLACEHOLDER — hosting provider]</strong> — runs the servers and database
              (data location: [PLACEHOLDER — region/EU?]).
            </li>
            <li>
              <strong>Sentry</strong> (error tracking, if enabled) — receives error reports.
              [PLACEHOLDER — confirm plan/region and DPA.]
            </li>
            <li>
              <strong>[PLACEHOLDER — email provider]</strong> — sends verification and
              password-reset emails to your address.
            </li>
            <li>
              <strong>Google</strong> (optional) — only if you choose &quot;Continue with
              Google&quot;; we receive your Google profile id, email, name, and picture.
            </li>
          </ul>
        </Section>

        <Section title="Legal basis">
          <p>
            We process account and content data to perform our contract with you (providing the
            service); security logging and rate limiting under legitimate interest; AI processing
            of your diagram occurs only on your initiative when you use the chat. [PLACEHOLDER —
            confirm lawful-basis mapping with counsel.]
          </p>
        </Section>

        <Section title="Retention">
          <p>
            Account and content data are kept while your account exists. AI usage records:
            [PLACEHOLDER — e.g. 12 months]. Server logs: [PLACEHOLDER — e.g. 30 days]. Audit
            logs: [PLACEHOLDER]. Backups: [PLACEHOLDER — cycle length]. When you delete your
            account, personal data is erased immediately (see below); residual copies leave
            backups within the backup cycle.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can <strong>export</strong> your data (profile, projects, diagrams, memberships,
            comments) as JSON and <strong>delete</strong> your account from the{' '}
            <Link to="/account" className="text-primary-600 hover:underline">
              Account page
            </Link>
            . Deletion erases your personal details (email, name, picture, credentials) and your
            personal records (notifications, AI usage, tokens); content you shared with
            collaborators remains, no longer attributed to you. You also have the right to
            rectification, restriction, objection, and to lodge a complaint with a supervisory
            authority ([PLACEHOLDER — competent authority, e.g. NAIH for Hungary]). For anything
            you cannot do in-app, contact [PLACEHOLDER — privacy contact email].
          </p>
        </Section>

        <Section title="Security">
          <p>
            Passwords are stored as bcrypt hashes; sessions use HttpOnly cookies; password-reset
            and verification links are single-use, expiring, and stored only as hashes; transport
            is encrypted (HTTPS) in production; access to production systems is restricted.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We will update this policy as the service evolves and indicate the date above.
            Material changes will be announced in the app.
          </p>
        </Section>
      </main>
    </div>
  );
}
