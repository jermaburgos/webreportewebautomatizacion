import { NextRequest } from "next/server";
import { createWorkflowLaunch, updateWorkflowLaunchById } from "@/app/lib/workflow-launches";

type DispatchBody = {
  test_name?: string;
  test_groups?: string;
  mode?: "case" | "suite";
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
  const groupsWorkflowFile = process.env.GITHUB_GROUPS_WORKFLOW_FILE?.trim() || "run-groups.yml";
  const ref = process.env.GITHUB_WORKFLOW_REF?.trim() || "feature/webYourStore";
  const apiVersion = process.env.GITHUB_API_VERSION?.trim() || "2026-03-10";

  return { token, repository, workflowFile, groupsWorkflowFile, ref, apiVersion };
}

async function fetchWorkflowRuns(
  config: ReturnType<typeof getGitHubConfig>,
  workflowFile: string,
): Promise<WorkflowRun[]> {
  const url = new URL(
    `https://api.github.com/repos/${config.repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs`,
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

async function waitForWorkflowRun(
  config: ReturnType<typeof getGitHubConfig>,
  workflowFile: string,
  startedAt: number,
): Promise<WorkflowRun | null> {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    const runs = await fetchWorkflowRuns(config, workflowFile);
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
  const mode = body?.mode === "suite" ? "suite" : "case";
  const testName = body?.test_name?.trim() ?? "";
  const testGroups = body?.test_groups?.trim() ?? "";

  if (mode === "suite" && !testGroups) {
    return Response.json({ error: "Falta test_groups" }, { status: 400 });
  }

  if (mode === "case" && !testName) {
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
  const workflowFile = mode === "suite" ? config.groupsWorkflowFile : config.workflowFile;
  const identifier = mode === "suite" ? testGroups : testName;

  const response = await fetch(
    `https://api.github.com/repos/${config.repository}/actions/workflows/${workflowFile}/dispatches`,
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
        inputs:
          mode === "suite"
            ? {
                test_groups: testGroups,
              }
            : {
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

  const launchedAt = new Date().toISOString();
  const launchRecord = await createWorkflowLaunch({
    mode,
    identifier,
    runId: null,
    status: "queued",
    conclusion: null,
    runUrl: null,
    updatedAt: launchedAt,
  });

  const workflowRun = await waitForWorkflowRun(config, workflowFile, startedAt);
  if (workflowRun?.id && launchRecord?.id) {
    await updateWorkflowLaunchById({
      id: launchRecord.id,
      runId: workflowRun.id,
      status: workflowRun.status ?? null,
      conclusion: workflowRun.conclusion ?? null,
      runUrl: workflowRun.html_url ?? null,
      updatedAt: workflowRun.updated_at ?? null,
    });
  }

  return Response.json(
      {
        message: mode === "suite" ? `Workflow lanzado para ${testGroups}.` : `Workflow lanzado para ${testName}.`,
        mode,
        test_name: testName || null,
        test_groups: testGroups || null,
        repository: config.repository,
        workflow: workflowFile,
        ref: config.ref,
        run_id: workflowRun?.id ?? null,
      run_status: workflowRun?.status ?? null,
      run_conclusion: workflowRun?.conclusion ?? null,
      run_url: workflowRun?.html_url ?? null,
    },
    { status: 200 },
  );
}
