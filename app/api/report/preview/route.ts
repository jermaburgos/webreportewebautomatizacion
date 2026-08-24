import { NextRequest } from "next/server";

function resolveRelativeUrl(value: string, sourceUrl: string): string {
  if (!value) {
    return value;
  }

  if (
    value.startsWith("#") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:") ||
    value.startsWith("javascript:")
  ) {
    return value;
  }

  const baseUrl = new URL(".", sourceUrl);
  return new URL(value, baseUrl).toString();
}

function rewriteAttribute(sourceHtml: string, sourceUrl: string, attribute: string): string {
  const pattern = new RegExp(`(${attribute}\\s*=\\s*["'])([^"']+)(["'])`, "gi");

  return sourceHtml.replace(pattern, (_match, prefix: string, value: string, suffix: string) => {
    return `${prefix}${resolveRelativeUrl(value, sourceUrl)}${suffix}`;
  });
}

function buildHtmlDocument(sourceHtml: string, sourceUrl: string): string {
  let html = sourceHtml;
  html = rewriteAttribute(html, sourceUrl, "src");
  html = rewriteAttribute(html, sourceUrl, "href");
  html = rewriteAttribute(html, sourceUrl, "action");
  html = rewriteAttribute(html, sourceUrl, "poster");
  html = rewriteAttribute(html, sourceUrl, "data");

  return html;
}

export async function GET(request: NextRequest) {
  const sourceUrl = request.nextUrl.searchParams.get("url");

  if (!sourceUrl) {
    return new Response("Falta el parámetro url", { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return new Response("La URL del reporte no es válida", { status: 400 });
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return new Response("La URL del reporte debe usar http o https", { status: 400 });
  }

  const response = await fetch(parsedUrl.toString(), {
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    return new Response(`No se pudo cargar el reporte: ${response.status}`, {
      status: response.status,
    });
  }

  const html = await response.text();
  const body = buildHtmlDocument(html, parsedUrl.toString());

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
