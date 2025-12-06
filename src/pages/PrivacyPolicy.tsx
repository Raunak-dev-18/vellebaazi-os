import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link to="/login">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Login
          </Button>
        </Link>

        <div className="prose prose-sm dark:prose-invert max-w-none">
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last Updated: November 2025</p>

          <p className="mb-6">
            We respect your privacy and are committed to protecting your data. This Privacy Policy explains what information we collect, how we use it, and your rights.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">1. Information We Collect</h2>
          <p className="mb-2">We collect the following types of data:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li><strong>Personal Information:</strong> Email address, profile details, and login credentials.</li>
            <li><strong>User Content:</strong> Photos, videos, text, audio, and other files you upload.</li>
            <li><strong>Usage Data:</strong> VelleBaazi interactions, engagement activity, browsing patterns, actions taken, and analytics.</li>
            <li><strong>Device Data:</strong> Device type, operating system, location (if enabled), IP address, and app performance logs.</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">2. How We Use Your Data</h2>
          <p className="mb-2">We use collected data for:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Operating and improving VelleBaazi.</li>
            <li>Personalizing user experience and recommendations.</li>
            <li>Ensuring safety, security, and fraud prevention.</li>
            <li>Analytics and performance insights.</li>
            <li>Communication, updates, and customer support.</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">3. Sharing Your Data</h2>
          <p className="mb-2">We may share data with:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Service providers such as cloud storage, analytics tools, or content delivery networks.</li>
            <li>Legal authorities if required for compliance, security, or law enforcement.</li>
            <li>Third‑party APIs integrated into VelleBaazi (only necessary usage data).</li>
          </ul>
          <p className="mb-4">We <strong>do not</strong> sell your personal information.</p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">4. Data Storage and Security</h2>
          <p className="mb-4">
            We use industry‑standard encryption and security protocols to protect data. Your content is stored securely, but no system is 100% secure. You use VelleBaazi at your own risk.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">5. User Rights</h2>
          <p className="mb-2">Depending on your region, you may have rights such as:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Accessing your data</li>
            <li>Requesting deletion</li>
            <li>Correcting inaccurate information</li>
            <li>Restricting processing</li>
          </ul>
          <p className="mb-4">You can contact support to request any of these actions.</p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">6. Cookies and Tracking</h2>
          <p className="mb-4">
            We use tracking technologies to personalize experience and analyze usage patterns. You may adjust settings in your device if supported.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">7. Children's Privacy</h2>
          <p className="mb-4">
            The VelleBaazi is not intended for children under 13. If we discover data from a child under this age, we will delete it.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">8. Changes to Privacy Policy</h2>
          <p className="mb-4">
            We may update this Privacy Policy and will notify users of significant changes.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">9. Contact</h2>
          <p className="mb-8">
            If you have questions regarding this Privacy Policy, please reach out to our support team.
          </p>
        </div>
      </div>
    </div>
  );
}
