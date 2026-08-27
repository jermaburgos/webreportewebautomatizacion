export type WorkflowLaunchMode = "case" | "suite";

export type WorkflowLaunchRow = {
  id: string;
  mode: WorkflowLaunchMode;
  identifier: string;
  run_id: number | null;
  status: string | null;
  conclusion: string | null;
  run_url: string | null;
  artifact_id: number | null;
  artifact_name: string | null;
  artifact_expired: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseConfig = {
  url: string;
  key: string;
};

function getSupabaseConfig(): SupabaseConfig | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ??
    process.env.SUPABASE_URL?.trim() ??
    "";
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ??
    process.env.SUPABASE_SECRET_KEYS?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
    process.env.SUPABASE_ANON_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
    "";

  if (!url || !key) {
    return null;
  }

  return { url, key };
}

async function fetchSupabaseJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  const response = await fetch(new URL(path, config.url), {
    ...init,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

export async function fetchWorkflowLaunches(limit = 24): Promise<WorkflowLaunchRow[]> {
  const payload = await fetchSupabaseJson<WorkflowLaunchRow[]>(
    `/rest/v1/workflow_launches?select=*&order=created_at.desc&limit=${limit}`,
  );

  return payload ?? [];
}

type CreateWorkflowLaunchInput = {
  mode: WorkflowLaunchMode;
  identifier: string;
  runId: number | null;
  status?: string | null;
  conclusion?: string | null;
  runUrl?: string | null;
  artifactId?: number | null;
  artifactName?: string | null;
  artifactExpired?: boolean | null;
  updatedAt?: string | null;
};

export async function createWorkflowLaunch(input: CreateWorkflowLaunchInput): Promise<WorkflowLaunchRow | null> {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  const response = await fetch(new URL("/rest/v1/workflow_launches", config.url), {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      mode: input.mode,
      identifier: input.identifier,
      run_id: input.runId,
      status: input.status ?? null,
      conclusion: input.conclusion ?? null,
      run_url: input.runUrl ?? null,
      artifact_id: input.artifactId ?? null,
      artifact_name: input.artifactName ?? null,
      artifact_expired: input.artifactExpired ?? false,
      updated_at: input.updatedAt ?? null,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as WorkflowLaunchRow[];
  return payload[0] ?? null;
}

type UpdateWorkflowLaunchInput = {
  runId: number;
  status?: string | null;
  conclusion?: string | null;
  runUrl?: string | null;
  artifactId?: number | null;
  artifactName?: string | null;
  artifactExpired?: boolean | null;
  updatedAt?: string | null;
};

export async function updateWorkflowLaunchByRunId(input: UpdateWorkflowLaunchInput): Promise<WorkflowLaunchRow | null> {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  const response = await fetch(
    new URL(`/rest/v1/workflow_launches?run_id=eq.${encodeURIComponent(String(input.runId))}`, config.url),
    {
      method: "PATCH",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: input.status ?? null,
        conclusion: input.conclusion ?? null,
        run_url: input.runUrl ?? null,
        artifact_id: input.artifactId ?? null,
        artifact_name: input.artifactName ?? null,
        artifact_expired: input.artifactExpired ?? null,
        updated_at: input.updatedAt ?? null,
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as WorkflowLaunchRow[];
  return payload[0] ?? null;
}

type UpdateWorkflowLaunchByIdInput = UpdateWorkflowLaunchInput & {
  id: string;
};

export async function updateWorkflowLaunchById(input: UpdateWorkflowLaunchByIdInput): Promise<WorkflowLaunchRow | null> {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  const response = await fetch(
    new URL(`/rest/v1/workflow_launches?id=eq.${encodeURIComponent(input.id)}`, config.url),
    {
      method: "PATCH",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        run_id: input.runId ?? null,
        status: input.status ?? null,
        conclusion: input.conclusion ?? null,
        run_url: input.runUrl ?? null,
        artifact_id: input.artifactId ?? null,
        artifact_name: input.artifactName ?? null,
        artifact_expired: input.artifactExpired ?? null,
        updated_at: input.updatedAt ?? null,
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as WorkflowLaunchRow[];
  return payload[0] ?? null;
}
