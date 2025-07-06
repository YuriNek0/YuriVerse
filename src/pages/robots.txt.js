import {SITE_URL} from "../consts.ts";

export function GET({ params, request }) {
  return new Response(
`User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap-index.xml`
  );
}


