import { NextRequest } from "next/server";

function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN?.trim() ?? "";
  const repository = process.env.GITHUB_REPOSITORY?.trim() || "jermaburgos/ProyectoBaseAutomatizacionSelenium";
  const apiVersion = process.env.GITHUB_API_VERSION?.trim() || "2026-03-10";

  return { token, repository, apiVersion };
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .trim()
    .slice(0, 120);
}

export async function GET(request: NextRequest) {
  const artifactId = request.nextUrl.searchParams.get("artifact_id")?.trim() ?? "";
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "workflow-artifact";

  if (!artifactId) {
    return Response.json({ error: "Falta artifact_id" }, { status: 400 });
  }

  const config = getGitHubConfig();
  if (!config.token) {
    return Response.json({ error: "Falta configurar GITHUB_TOKEN en el entorno del servidor." }, { status: 500 });
  }

  const response = await fetch(
    `https://api.github.com/repos/${config.repository}/actions/artifacts/${artifactId}/zip`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": config.apiVersion,
      },
      cache: "no-store",
    },
  );

  if (!response.ok || !response.body) {
    const detail = await response.text();
    return Response.json(
      {
        error: `No se pudo descargar el artifact: ${response.status}`,
        detail,
      },
      { status: response.status || 502 },
    );
  }

  const headers = new Headers();
  headers.set("content-type", response.headers.get("content-type") || "application/zip");
  headers.set("content-disposition", `attachment; filename="${sanitizeFileName(name)}.zip"`);
  headers.set("cache-control", "no-store");

  return new Response(response.body, {
    status: 200,
    headers,
  });
}
