import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Privacy policy + cookie notice.
 *
 * The technical disclosures reflect what the app actually does (verified against
 * the codebase and the production deployment). RAMSey is a free, independent
 * project run by a solo developer; data is stored only to operate your account,
 * projects, and teams — never sold, shared for others' purposes, or used for
 * anything else.
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
          <Link to="/" className="text-surface-500 hover:text-surface-700" title="Back">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold text-surface-900">Privacy Policy</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <p className="mb-8 text-xs text-surface-500">
          Last updated: 18 July 2026. RAMSey (&quot;the service&quot;) is a free, independent
          project maintained by a solo developer based in Hungary. It stores your data only to run
          your account, projects, and teams — nothing else. For any privacy question or request,
          contact{' '}
          <a href="mailto:szilagyiborbala8@gmail.com" className="text-primary-600 hover:underline">
            szilagyiborbala8@gmail.com
          </a>
          .
        </p>

        <Section title="What data we process">
          <p>
            <strong>Account data.</strong> Your email address, optional display name, optional
            profile picture, and either a hashed password or, if you sign in with Google, your
            Google account identifier. Used to authenticate you and operate your account.
          </p>
          <p>
            <strong>Content you create.</strong> Projects, diagrams, snapshots, comments, and team
            memberships. Diagrams may be shared with collaborators you or your team choose; content
            you have shared remains visible to those collaborators even after you delete your
            account (your identity is removed from it).
          </p>
          <p>
            <strong>Technical data.</strong> Server logs (IP address, request metadata) for security
            and rate limiting, and audit-log entries recording account and project actions.
          </p>
        </Section>

        <Section title="What we do NOT do">
          <p>
            The service is free. We store your data solely to provide it — your account, projects,
            and teams. We do <strong>not</strong> sell your data, share it with third parties for
            their own purposes, run advertising, use third-party analytics, profile you, or use your
            data for anything beyond operating the service.
          </p>
        </Section>

        <Section title="Cookies and local storage">
          <p>
            We use a single, strictly necessary cookie — <code>ramsey_token</code> — to keep you
            signed in (HttpOnly, expires after 7 days). Because it is essential for the service and
            we use no advertising or analytics cookies, no cookie consent banner is required; this
            notice serves as disclosure.
          </p>
          <p>
            Your browser&apos;s local storage holds convenience data that never leaves your device
            through us: your theme preference, a guest identifier (when using the app without an
            account), locally cached analysis results, and diagrams created in guest mode.
          </p>
        </Section>

        <Section title="Who processes your data (subprocessors)">
          <p>
            To run the service we rely on a small number of infrastructure providers. They act only
            as processors on our behalf, bound by their data-processing terms, and do not use your
            data for their own purposes:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Amazon Web Services (AWS)</strong> — hosts the application server and the
              PostgreSQL database in the EU (Frankfurt region).
            </li>
            <li>
              <strong>Cloudflare</strong> — serves the website and proxies traffic to the API
              (content delivery and network security), and stores daily off-site backups of the
              database in its EU region (R2 object storage).
            </li>
            <li>
              <strong>Resend</strong> — delivers account emails (address verification and password
              reset) to your address.
            </li>
            <li>
              <strong>Google</strong> (only if you choose &quot;Continue with Google&quot;) — we
              receive your Google profile id, email, name, and picture to create or sign you into
              your account.
            </li>
          </ul>
          <p>
            The application, database, and off-site backups are hosted in the EU. The Cloudflare
            content-delivery and proxy layer, and email delivery (Resend), may process limited data
            outside the EU under standard contractual clauses.
          </p>
        </Section>

        <Section title="Legal basis">
          <p>
            We process account and content data to perform our agreement with you (providing the
            service). Security logging and rate limiting rely on our legitimate interest in keeping
            the service safe and available.
          </p>
        </Section>

        <Section title="Retention">
          <p>
            Account and content data are kept while your account exists. Server logs are kept for a
            short period (roughly 30 days) for security and abuse prevention. The database is backed
            up automatically each day — on the server and off-site to Cloudflare&apos;s EU storage —
            and backups rotate on a schedule, retained for up to about four months. When you delete
            your account, personal data is erased immediately (see below); residual copies leave the
            backups within that cycle.
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
            personal records (notifications, tokens); content you shared with collaborators remains,
            no longer attributed to you. You also have the right to rectification, restriction,
            objection, and to lodge a complaint with your supervisory authority — in Hungary, the
            Nemzeti Adatvédelmi és Információszabadság Hatóság (NAIH). For anything you cannot do
            in-app, contact{' '}
            <a
              href="mailto:szilagyiborbala8@gmail.com"
              className="text-primary-600 hover:underline"
            >
              szilagyiborbala8@gmail.com
            </a>
            .
          </p>
        </Section>

        <Section title="Security">
          <p>
            Passwords are stored as bcrypt hashes; sessions use HttpOnly cookies; password-reset and
            verification links are single-use, expiring, and stored only as hashes; transport is
            encrypted (HTTPS) in production; access to production systems is restricted.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We will update this policy as the service evolves and indicate the date above. Material
            changes will be announced in the app.
          </p>
        </Section>
      </main>
    </div>
  );
}
