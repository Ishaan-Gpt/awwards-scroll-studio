import { auth, defineMcp } from "@lovable.dev/mcp-js";
import recordWebsite from "./tools/record-website";
import getJob from "./tools/get-job";
import listJobs from "./tools/list-jobs";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "smoothrecord",
  title: "SmoothRecord",
  version: "0.2.0",
  instructions:
    "SmoothRecord turns any website into a premium Awwwards-style smooth-scroll MP4. Use `record_website` to start a job, then `get_job` to poll until status is `succeeded` and read `mp4Url`. Use `list_jobs` for recent recordings.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [recordWebsite, getJob, listJobs],
});
