import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy — SmoothRecord" }, { name: "description", content: "SmoothRecord privacy policy." }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-20 text-foreground">
      <h1 className="font-display text-5xl mb-8">Privacy</h1>
      <div className="prose prose-invert text-muted-foreground space-y-6">
        <p>We collect the minimum necessary to run SmoothRecord: your email (for sign-in), the URLs or HTML you record, and the resulting videos.</p>
        <h2 className="font-display text-2xl text-foreground">Recordings</h2>
        <p>Video rendering happens on <em className="text-foreground not-italic">your own paired worker</em> (a process running on your computer). The finished MP4 is only served through your worker's tunnel; we never store the video on our servers.</p>
        <h2 className="font-display text-2xl text-foreground">Worker tokens</h2>
        <p>Your worker's access token is generated on your machine and stored encrypted (AES-256-GCM) in our database. Plaintext tokens are never logged.</p>
        <h2 className="font-display text-2xl text-foreground">Analytics</h2>
        <p>We record job status and duration for quota enforcement and error visibility. We do not track your browsing or share data with third parties.</p>
        <h2 className="font-display text-2xl text-foreground">Deletion</h2>
        <p>Delete your workers and API keys anytime from your dashboard. Contact us to fully delete your account.</p>
        <p className="text-xs">Last updated: {new Date().getFullYear()}.</p>
      </div>
    </main>
  );
}
