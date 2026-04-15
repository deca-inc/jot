import type { MetaFunction } from "@remix-run/cloudflare";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => {
  return [
    { title: "Terms and Conditions - Jot" },
    { name: "description", content: "Terms and Conditions for Jot" },
  ];
};

export default function Terms() {
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
            Terms and Conditions
          </h1>

          <div className="prose prose-invert max-w-none">
            <p className="text-sm text-gray-400">
              Last Updated: November 15, 2025
            </p>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                1. Acceptance of Terms
              </h2>
              <p className="mt-4 text-gray-300">
                By accessing and using Jot ("the App"), you accept and agree to
                be bound by the terms and provision of this agreement. If you do
                not agree to these Terms and Conditions, please do not use the
                App.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                2. Description of Service
              </h2>
              <p className="mt-4 text-gray-300">
                Jot is a personal journaling application that provides offline
                functionality, end-to-end encryption, and AI-assisted features.
                The App is designed to store your personal notes and journal
                entries securely on your device.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                3. Privacy and Data Security
              </h2>
              <p className="mt-4 text-gray-300">
                We take your privacy seriously. All journal entries and personal
                data are encrypted and stored locally on your device. We do not
                have access to your journal entries. For more details, please
                review our Privacy Policy.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                4. User Responsibilities
              </h2>
              <p className="mt-4 text-gray-300">You are responsible for:</p>
              <ul className="mt-2 list-inside list-disc space-y-2 text-gray-300">
                <li>
                  Maintaining the security of your device and access credentials
                </li>
                <li>All content you create, store, or share using the App</li>
                <li>Backing up your data as needed</li>
                <li>
                  Using the App in compliance with all applicable laws and
                  regulations
                </li>
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                5. AI Features
              </h2>
              <p className="mt-4 text-gray-300">
                The App includes AI-assisted features to enhance your journaling
                experience. These features process your content locally on your
                device to maintain privacy. AI-generated content is provided as
                suggestions and should not be considered professional advice.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                6. Intellectual Property
              </h2>
              <p className="mt-4 text-gray-300">
                The App and its original content, features, and functionality
                are owned by Jot and are protected by international copyright,
                trademark, patent, trade secret, and other intellectual property
                laws. You retain all rights to the content you create using the
                App.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                7. Limitation of Liability
              </h2>
              <p className="mt-4 text-gray-300">
                Jot shall not be liable for any indirect, incidental, special,
                consequential, or punitive damages resulting from your use or
                inability to use the App, including but not limited to loss of
                data or journal entries.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                8. Changes to Terms
              </h2>
              <p className="mt-4 text-gray-300">
                We reserve the right to modify or replace these Terms at any
                time. Continued use of the App after any such changes
                constitutes your acceptance of the new Terms.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                9. Termination
              </h2>
              <p className="mt-4 text-gray-300">
                We may terminate or suspend your access to the App immediately,
                without prior notice or liability, for any reason whatsoever,
                including without limitation if you breach the Terms.
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-2xl font-semibold text-gray-100">
                10. Contact Information
              </h2>
              <p className="mt-4 text-gray-300">
                If you have any questions about these Terms, please contact us
                through the App's support channels.
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
