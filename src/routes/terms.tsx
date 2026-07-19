import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms — SmoothRecord" }, { name: "description", content: "SmoothRecord terms of service." }] }),
  component: Terms,
});

function Terms() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-20 text-foreground">
      <h1 className="font-display text-5xl mb-8">Terms of Service</h1>
      <div className="prose prose-invert text-muted-foreground space-y-6">
        <p>By using SmoothRecord you agree to these terms. SmoothRecord provides a service for recording smooth-scroll videos of websites you own or have permission to record.</p>
        <h2 className="font-display text-2xl text-foreground">1. Acceptable use</h2>
        <p>Do not record websites you do not own or have written permission to record. Do not use SmoothRecord to bypass paywalls, evade authentication, or harvest personal data.</p>
        <h2 className="font-display text-2xl text-foreground">2. Your worker</h2>
        <p>Recordings run on infrastructure you provide (your own computer, via the paired worker). You are responsible for that infrastructure and the bandwidth it consumes.</p>
        <h2 className="font-display text-2xl text-foreground">3. Quotas</h2>
        <p>Free accounts are subject to daily quota limits. Abuse may result in suspension.</p>
        <h2 className="font-display text-2xl text-foreground">4. No warranty</h2>
        <p>SmoothRecord is provided as-is, without warranty of any kind.</p>
        <p className="text-xs">Last updated: {new Date().getFullYear()}.</p>
      </div>
    </main>
  );
}
