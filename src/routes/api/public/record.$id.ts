import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/record/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const workerUrl = process.env.WORKER_BASE_URL;
        const workerToken = process.env.WORKER_TOKEN;
        const id = params.id;

        if (id.startsWith("demo_")) {
          return Response.json({
            status: "failed",
            error: "Worker not configured. Deploy /worker and set WORKER_BASE_URL.",
          });
        }
        if (!workerUrl || !workerToken) {
          return Response.json({ status: "failed", error: "Worker not configured." }, { status: 500 });
        }
        try {
          const res = await fetch(`${workerUrl.replace(/\/$/, "")}/jobs/${encodeURIComponent(id)}`, {
            headers: { Authorization: `Bearer ${workerToken}` },
          });
          const body = await res.json();
          return Response.json(body, { status: res.status });
        } catch (e) {
          console.error("Worker unreachable:", e);
          return Response.json({ status: "failed", error: "Worker unreachable" }, { status: 502 });
        }
      },
    },
  },
});
