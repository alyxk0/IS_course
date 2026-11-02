import api from "./api.js";
import assets from "virtual:sheet-assets";
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api.fetch(request, env, ctx);
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", { status: 405 });
    const path = url.pathname === "/" ? "/index.html" : url.pathname,
      asset =
        assets[path] ||
        (!url.pathname.startsWith("/assets/") ? assets["/index.html"] : null);
    if (!asset) return new Response("Not found", { status: 404 });
    const headers = {
      "Content-Type": asset.type,
      ETag: asset.etag,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": path.startsWith("/assets/")
        ? "public,max-age=31536000,immutable"
        : "no-cache",
    };
    if (request.headers.get("If-None-Match") === asset.etag)
      return new Response(null, { status: 304, headers });
    return new Response(
      request.method === "HEAD"
        ? null
        : asset.base64
          ? Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0))
          : asset.body,
      { headers },
    );
  },
};
