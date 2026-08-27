import { NextRequest } from "next/server";
import { updateWorkflowLaunchByRunId } from "@/app/lib/workflow-launches";

function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN?.trim() ?? "";
  const repository = process.env.GITHUB_REPOSITORY?.trim() || "jermaburgos/ProyectoBaseAutomatizacionSelenium";
  const apiVersion = process.env.GITHUB_API_VERSION?.trim() || "2026-03-10";

  return { token, repository, apiVersion };
}

type GitHubArtifact = {
  id: number;
  name: string;
  expired: boolean;
  archive_download_url: string;
  created_at: string | null;
};

async function fetchRunArtifacts(
  config: ReturnType<typeof getGitHubConfig>,
  runId: string,
): Promise<GitHubArtifact[]> {
  const response = await fetch(
    `https://api.github.com/repos/${config.repository}/actions/runs/${runId}/artifacts?per_page=20`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": config.apiVersion,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { artifacts?: GitHubArtifact[] };
  return payload.artifacts ?? [];
}

function selectArtifact(artifacts: GitHubArtifact[]): GitHubArtifact | null {
  if (!artifacts.length) {
    return null;
  }

  const prioritized = [...artifacts]
    .filter((artifact) => !artifact.expired)
    .sort((left, right) => {
      const leftScore = left.name.toLowerCase().includes("report") ? 1 : 0;
      const rightScore = right.name.toLowerCase().includes("report") ? 1 : 0;
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      return new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime();
    });

  return prioritized[0] ?? null;
}

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("run_id")?.trim() ?? "";

  if (!runId) {
    return Response.json({ error: "Falta run_id" }, { status: 400 });
  }

  const config = getGitHubConfig();
  if (!config.token) {
    return Response.json({ error: "Falta configurar GITHUB_TOKEN en el entorno del servidor." }, { status: 500 });
  }

  const response = await fetch(`https://api.github.com/repos/${config.repository}/actions/runs/${runId}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": config.apiVersion,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    return Response.json(
      {
        error: `No se pudo leer el estado del workflow: ${response.status}`,
        detail,
      },
      { status: response.status },
    );
  }

  const payload = (await response.json()) as {
    id?: number;
    name?: string;
    status?: string;
    conclusion?: string | null;
    html_url?: string;
    updated_at?: string;
    created_at?: string;
    head_branch?: string;
  };

  const artifact = selectArtifact(await fetchRunArtifacts(config, runId));
  await updateWorkflowLaunchByRunId({
    runId: Number(runId),
    status: payload.status ?? null,
    conclusion: payload.conclusion ?? null,
    runUrl: payload.html_url ?? null,
    artifactId: artifact?.id ?? null,
    artifactName: artifact?.name ?? null,
    artifactExpired: artifact?.expired ?? null,
    updatedAt: payload.updated_at ?? null,
  });

  return Response.json(
    {
      run_id: payload.id ?? Number(runId),
      name: payload.name ?? "Workflow",
      status: payload.status ?? "unknown",
      conclusion: payload.conclusion ?? null,
      html_url: payload.html_url ?? "",
      updated_at: payload.updated_at ?? "",
      created_at: payload.created_at ?? "",
      head_branch: payload.head_branch ?? "",
      artifact_id: artifact?.id ?? null,
      artifact_name: artifact?.name ?? null,
      artifact_expired: artifact?.expired ?? null,
      artifact_download_url: artifact?.archive_download_url ?? null,
    },
    { status: 200 },
  );
}
