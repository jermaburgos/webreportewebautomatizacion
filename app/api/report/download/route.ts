import { NextRequest } from "next/server";

function getFileName(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const candidate = parts.at(-1);

    if (candidate && candidate.trim()) {
      return candidate;
    }
  } catch {
    // Fall through to default file name.
  }

  return "report.html";
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

  if (!response.ok || !response.body) {
    return new Response(`No se pudo descargar el reporte: ${response.status}`, {
      status: response.status || 502,
    });
  }

  const headers = new Headers();
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  headers.set("content-type", contentType);
  headers.set("content-disposition", `attachment; filename="${getFileName(parsedUrl.toString())}"`);
  headers.set("cache-control", "no-store");

  return new Response(response.body, {
    status: 200,
    headers,
  });
}
