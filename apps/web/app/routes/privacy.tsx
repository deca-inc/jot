import type { MetaFunction } from "@remix-run/cloudflare";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => {
  return [
    { title: "Privacy Policy - Jot" },
    { name: "description", content: "Privacy Policy for Jot" },
  ];
};

export default function Privacy() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <Link to="/" className="inline-block">
            <img src="/logo-dark.png" alt="Jot Logo" className="h-12" />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-8 text-4xl font-bold text-gray-100">
            Privacy Policy
          </h1>

          <div className="prose prose-invert max-w-none">
            <p className="text-sm text-gray-400">
              Last Updated: November 15, 2025
            </p>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                1. Introduction
              </h2>
              <p className="mt-4 text-gray-300">
                At Jot, we respect your privacy and are committed to protecting
                your personal data. This Privacy Policy explains how we handle
                your information when you use our journaling application.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                2. Our Privacy Commitment
              </h2>
              <p className="mt-4 text-gray-300">
                Jot is designed with privacy as a core principle:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-2 text-gray-300">
                <li>
                  <strong>Offline First:</strong> Your journal entries are
                  stored locally on your device
                </li>
                <li>
                  <strong>End-to-End Encryption:</strong> All your data is
                  encrypted and only accessible by you
                </li>
                <li>
                  <strong>No Cloud Storage:</strong> We do not store your
                  journal entries on our servers
                </li>
                <li>
                  <strong>No Data Collection:</strong> We cannot read, access,
                  or share your personal journal entries
                </li>
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                3. Information We Don't Collect
              </h2>
              <p className="mt-4 text-gray-300">
                We do NOT collect, store, or have access to:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-2 text-gray-300">
                <li>Your journal entries or personal notes</li>
                <li>Content of your writings</li>
                <li>Personal thoughts, ideas, or reflections you record</li>
                <li>
                  Any data processed by AI features (all processed locally on
                  your device)
                </li>
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                4. Information We May Collect
              </h2>
              <p className="mt-4 text-gray-300">
                We may collect minimal, non-personal information to improve the
                App:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-2 text-gray-300">
                <li>
                  Anonymous usage statistics (e.g., app opens, feature usage)
                </li>
                <li>Crash reports and technical diagnostics</li>
                <li>Device type and operating system version</li>
              </ul>
              <p className="mt-4 text-gray-300">
                This information is collected anonymously and cannot be linked
                to your identity or journal content.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                5. How We Use Information
              </h2>
              <p className="mt-4 text-gray-300">
                Any anonymous data we collect is used solely to:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-2 text-gray-300">
                <li>Improve app performance and stability</li>
                <li>Fix bugs and technical issues</li>
                <li>Understand which features are most useful to users</li>
                <li>Enhance user experience</li>
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                6. AI Features and Privacy
              </h2>
              <p className="mt-4 text-gray-300">
                Our AI-assisted features are designed with privacy in mind:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-2 text-gray-300">
                <li>All AI processing happens locally on your device</li>
                <li>
                  Your journal content is never sent to external servers for AI
                  analysis
                </li>
                <li>AI models run entirely offline to maintain your privacy</li>
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                7. Optional Third-Party Services
              </h2>
              <p className="mt-4 text-gray-300">
                At your discretion, you may choose to enable optional
                third-party services within the App, such as:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-2 text-gray-300">
                <li>
                  <strong>Online AI Services:</strong> You can optionally
                  configure external AI services or personal servers for
                  enhanced AI features
                </li>
                <li>
                  <strong>Backup Services:</strong> You can optionally configure
                  backup to cloud storage providers or personal servers of your
                  choice
                </li>
              </ul>
              <p className="mt-4 text-gray-300">
                <strong>Important:</strong> These features are entirely optional
                and disabled by default. When you choose to enable any
                third-party service, you will be fully informed about what data
                will be shared and have complete control over the configuration.
                Any backups will be end-to-end encrypted.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                8. Data Security
              </h2>
              <p className="mt-4 text-gray-300">
                We implement industry-standard security measures:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-2 text-gray-300">
                <li>End-to-end encryption for all journal entries</li>
                <li>Local storage on your device only</li>
                <li>
                  No transmission of personal journal content over the internet
                </li>
                <li>Regular security updates and patches</li>
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                9. Third-Party Services
              </h2>
              <p className="mt-4 text-gray-300">
                To provide and improve the App, we use the following third-party
                services. Importantly,{" "}
                <strong>
                  none of these services have access to your journal content
                </strong>
                , which remains encrypted and stored locally on your device.
              </p>

              <div className="mt-6">
                <h3 className="text-xl font-semibold text-gray-100">
                  Expo (Expo Application Services)
                </h3>
                <p className="mt-2 text-gray-300">
                  We use Expo to deliver over-the-air (OTA) updates to the App.
                  This allows us to push bug fixes and improvements without
                  requiring a full app store update. Expo may collect:
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-gray-300">
                  <li>Device information (model, OS version)</li>
                  <li>App version and update status</li>
                  <li>Anonymous technical diagnostics</li>
                </ul>
                <p className="mt-2 text-gray-300">
                  Learn more:{" "}
                  <a
                    href="https://expo.dev/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    Expo Privacy Policy
                  </a>
                </p>
              </div>

              <div className="mt-6">
                <h3 className="text-xl font-semibold text-gray-100">
                  PostHog (Optional Analytics)
                </h3>
                <p className="mt-2 text-gray-300">
                  When you first install the App, you will be asked to choose
                  whether to enable anonymous analytics. If you opt in, we use
                  PostHog to collect anonymous usage data to help us understand
                  how the App is used and improve the user experience. PostHog
                  may collect:
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-gray-300">
                  <li>Anonymous feature usage patterns</li>
                  <li>App navigation and interaction events</li>
                  <li>Technical performance metrics</li>
                  <li>Anonymous device characteristics</li>
                </ul>
                <p className="mt-2 text-gray-300">
                  <strong>Important:</strong> Analytics are completely optional
                  and you choose during setup whether to enable them. You can
                  change your analytics preference at any time in the App
                  settings. Even with analytics enabled, your journal content is
                  never collected or transmitted.
                </p>
                <p className="mt-2 text-gray-300">
                  Learn more:{" "}
                  <a
                    href="https://posthog.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    PostHog Privacy Policy
                  </a>
                </p>
              </div>

              <div className="mt-6">
                <h3 className="text-xl font-semibold text-gray-100">
                  Apple App Store & Google Play Store
                </h3>
                <p className="mt-2 text-gray-300">
                  When you download Jot from the Apple App Store or Google Play
                  Store, these platforms may collect information about your
                  download, installation, and in-app purchases according to
                  their own privacy policies:
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-gray-300">
                  <li>Download and installation data</li>
                  <li>App review and rating information</li>
                  <li>Purchase and subscription details (if applicable)</li>
                  <li>Crash reports submitted through the platform</li>
                </ul>
                <p className="mt-2 text-gray-300">
                  We do not have direct access to personally identifiable
                  information collected by these app stores. Learn more:
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-gray-300">
                  <li>
                    <a
                      href="https://www.apple.com/legal/privacy/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      Apple Privacy Policy
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://policies.google.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      Google Privacy Policy
                    </a>
                  </li>
                </ul>
              </div>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                10. Children's Privacy
              </h2>
              <p className="mt-4 text-gray-300">
                Jot is designed for users of all ages. Since we do not collect
                personal information, including from children, we comply with
                all applicable children's privacy laws.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                11. Your Rights
              </h2>
              <p className="mt-4 text-gray-300">
                Because all your data is stored locally on your device:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-2 text-gray-300">
                <li>You have complete control over your data</li>
                <li>
                  You can delete your data at any time by uninstalling the app
                </li>
                <li>
                  You can export your data at any time through the app's export
                  feature
                </li>
                <li>
                  No data requests are necessary as we don't store your personal
                  information
                </li>
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                12. Changes to This Policy
              </h2>
              <p className="mt-4 text-gray-300">
                We may update this Privacy Policy from time to time. We will
                notify you of any changes by posting the new Privacy Policy on
                this page and updating the "Last Updated" date.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                13. Contact Us
              </h2>
              <p className="mt-4 text-gray-300">
                If you have any questions about this Privacy Policy, please
                contact us through the App's support channels or visit our
                website.
              </p>
            </section>

            <section className="mt-8 rounded-lg bg-blue-900/20 p-6">
              <h3 className="text-xl font-semibold text-blue-100">
                In Summary
              </h3>
              <p className="mt-2 text-blue-200">
                Your privacy is paramount. We cannot read your journals, we
                don't store your data on our servers, and all AI processing
                happens locally on your device. Your thoughts remain yours
                alone.
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-4 text-sm text-gray-400 sm:flex-row sm:justify-center sm:gap-8">
            <Link to="/terms" className="hover:text-gray-100 hover:underline">
              Terms and Conditions
            </Link>
            <Link to="/privacy" className="hover:text-gray-100 hover:underline">
              Privacy Policy
            </Link>
            <div>© {new Date().getFullYear()} Jot. All rights reserved.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
