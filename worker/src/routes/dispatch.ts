export type WorkerFetchRoute =
  | "root"
  | "graphql"
  | "pinpointToday"
  | "adminPreflightLinkedin"
  | "adminTestFallback"
  | "adminCandidateBranchDryRun"
  | "adminReleaseQueueDryRun"
  | "adminReleaseQueueStatusCheck"
  | "adminAutoPublishPause"
  | "adminRun"
  | "adminPutDoc"
  | "adminUploadOps"
  | "health"
  | "monitorCronStatus"
  | "notFound";

export function resolveWorkerFetchRoute(req: Request, url: URL): WorkerFetchRoute {
  if (url.pathname === "/") return "root";
  if (url.pathname === "/graphql") return "graphql";
  if (url.pathname === "/api/pinpoint/today") return "pinpointToday";
  if (url.pathname === "/admin/preflight-linkedin") return "adminPreflightLinkedin";
  if (url.pathname === "/admin/test-fallback") return "adminTestFallback";
  if (url.pathname === "/admin/candidate-branch-dry-run" && req.method === "POST") {
    return "adminCandidateBranchDryRun";
  }
  if (url.pathname === "/admin/release-queue-dry-run" && req.method === "POST") {
    return "adminReleaseQueueDryRun";
  }
  if (url.pathname === "/admin/release-queue-status-check") return "adminReleaseQueueStatusCheck";
  if (url.pathname === "/admin/auto-publish-pause") return "adminAutoPublishPause";
  if (url.pathname === "/admin/run") return "adminRun";
  if (url.pathname === "/admin/put-doc" && req.method === "POST") return "adminPutDoc";
  if (url.pathname === "/admin/upload-ops" && req.method === "POST") return "adminUploadOps";
  if (url.pathname === "/health") return "health";
  if (url.pathname === "/monitor/cron-status") return "monitorCronStatus";
  return "notFound";
}
