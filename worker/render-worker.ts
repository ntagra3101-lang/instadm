// insta-autodm: runs the OpenReply DM worker as a Render free "web service".
//
// Render's free plan only offers web services, and they must answer HTTP on
// $PORT. This file starts the normal worker (by importing it) and adds a tiny
// health page. cron-job.org opens /healthz every 5 minutes so the service does
// not fall asleep, and the Vercel webhook opens it when a comment arrives.
import http from "node:http";
import "./dm-worker";

const port = Number(process.env.PORT ?? 10000);

http
  .createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
    res.end("ok");
  })
  .listen(port, () => {
    console.log(`[Render] health page listening on port ${port}`);
  });
