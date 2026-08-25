import { NextRequest } from "next/server";

type DispatchBody = {
  test_name?: string;
};

type WorkflowRun = {
  id: number;
  status: string | null;
  conclusion: string | null;
  html_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN?.trim() ?? "";
  const repository = process.env.GITHUB_REPOSITORY?.trim() || "jermaburgos/ProyectoBaseAutomatizacionSelenium";
  const workflowFile = process.env.GITHUB_WORKFLOW_FILE?.trim() || "run-single-test.yml";
  const ref = process.env.GITHUB_WORKFLOW_REF?.trim() || "feature/webYourStore";
  const apiVersion = process.env.GITHUB_API_VERSION?.trim() || "2026-03-10";

  return { token, repository, workflowFile, ref, apiVersion };
}

async function fetchWorkflowRuns(config: ReturnType<typeof getGitHubConfig>): Promise<WorkflowRun[]> {
  const url = new URL(
    `https://api.github.com/repos/${config.repository}/actions/workflows/${encodeURIComponent(config.workflowFile)}/runs`,
  );
  url.searchParams.set("event", "workflow_dispatch");
  url.searchParams.set("branch", config.ref);
  url.searchParams.set("per_page", "10");

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": config.apiVersion,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { workflow_runs?: WorkflowRun[] };
  return payload.workflow_runs ?? [];
}

async function waitForWorkflowRun(config: ReturnType<typeof getGitHubConfig>, startedAt: number): Promise<WorkflowRun | null> {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    const runs = await fetchWorkflowRuns(config);
    const candidate = runs.find((run) => {
      if (!run.created_at) {
        return false;
      }

      const createdAt = new Date(run.created_at).getTime();
      return Number.isFinite(createdAt) && createdAt >= startedAt;
    });

    if (candidate) {
      return candidate;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return null;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as DispatchBody | null;
  const testName = body?.test_name?.trim() ?? "";

  if (!testName) {
    return Response.json({ error: "Falta test_name" }, { status: 400 });
  }

  const config = getGitHubConfig();
  if (!config.token) {
    return Response.json(
      {
        error:
          "Falta configurar GITHUB_TOKEN en el entorno del servidor.",
      },
      { status: 500 },
    );
  }

  const startedAt = Date.now();

  const response = await fetch(
    `https://api.github.com/repos/${config.repository}/actions/workflows/${config.workflowFile}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": config.apiVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: config.ref,
        inputs: {
          test_name: testName,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    return Response.json(
      {
        error: `No se pudo lanzar el workflow: ${response.status}`,
        detail,
      },
      { status: response.status },
    );
  }

  const workflowRun = await waitForWorkflowRun(config, startedAt);

  return Response.json(
    {
      message: `Workflow lanzado para ${testName}.`,
      test_name: testName,
      repository: config.repository,
      workflow: config.workflowFile,
      ref: config.ref,
      run_id: workflowRun?.id ?? null,
      run_status: workflowRun?.status ?? null,
      run_conclusion: workflowRun?.conclusion ?? null,
      run_url: workflowRun?.html_url ?? null,
    },
    { status: 200 },
  );
}
