import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermsOfService() {
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
          <h1 className="text-3xl font-bold mb-2">Terms of Service (ToS)</h1>
          <p className="text-muted-foreground mb-8">Last Updated: November 2025</p>

          <p className="mb-6">
            Welcome to our application ("VelleBaazi"). By using our services, you agree to the following Terms of Service. Please read them carefully before accessing or using VelleBaazi.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">1. Use of VelleBaazi</h2>
          <p className="mb-4">
            You must be at least 13 years old to use VelleBaazi. By accessing VelleBaazi, you confirm that the information you provide is accurate and you will comply with all applicable laws.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">2. User Accounts</h2>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>You are responsible for maintaining the confidentiality of your account and login information.</li>
            <li>You agree not to share your account with others or use another person's account.</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">3. User Content</h2>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>You may upload images, videos, text, and other media ("User Content").</li>
            <li>By uploading content, you grant us a worldwide, non-exclusive license to store, process, and display the content within VelleBaazi.</li>
            <li>You are responsible for ensuring that your content does not violate any copyright, privacy rights, or laws.</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">4. Data Collection and Activity Tracking</h2>
          <p className="mb-2">Our VelleBaazi collects user data such as:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Images, videos, text, and messages you upload.</li>
            <li>Email address and basic profile details.</li>
            <li>Usage activity including interactions, time spent, device information, and analytics—similar to platforms like Instagram.</li>
          </ul>
          <p className="mb-4">
            You consent to this data collection and understand that it is required for features such as personalized recommendations, security, and app improvements.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">5. Prohibited Activities</h2>
          <p className="mb-2">You agree not to:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Engage in harmful, abusive, or illegal behavior.</li>
            <li>Upload content that is hateful, threatening, explicit, or violates laws.</li>
            <li>Attempt to hack, reverse-engineer, or disrupt VelleBaazi's services.</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">6. Intellectual Property</h2>
          <p className="mb-4">
            All VelleBaazi features, design, branding, and code belong to VelleBaazi owners. You may not copy or misuse any part of VelleBaazi's intellectual property.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">7. Termination</h2>
          <p className="mb-4">
            We may suspend or terminate your account if you violate these Terms or if we suspect harmful activity.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">8. Changes to the Terms</h2>
          <p className="mb-4">
            We may update these Terms from time to time. Continued use of VelleBaazi means you accept the revised Terms.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">9. Contact</h2>
          <p className="mb-8">
            For any concerns about these Terms, contact our support team.
          </p>
        </div>
      </div>
    </div>
  );
}
