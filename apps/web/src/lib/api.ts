const ORG_HEADER = { "x-org-id": "org_arka" } as const;

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    headers: ORG_HEADER,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export async function seedOnceIfEmpty(): Promise<boolean> {
  const { exceptions } = await api<{ exceptions: unknown[] }>("/v1/exceptions");
  if (exceptions.length > 0) return false;
  const res = await fetch("/v1/admin/seed", {
    method: "POST",
    headers: ORG_HEADER,
  });
  if (!res.ok) throw new Error(`/v1/admin/seed ${res.status}`);
  return true;
}

export type ApiException = {
  id: string;
  severity: "risk" | "warn";
  code: string;
  nodeId: string;
  title: string;
  detail: string;
};

export type ApiNode = {
  _id: string;
  type: string;
  key: string;
  label: string;
};

export type Bootstrap = {
  org: ApiNode;
  exceptionCount: number;
  cashInPaise: number;
};

export type { Neighborhood } from "./neighborhood.js";
export { neighborhoodKeysFrom, neighborhoodPath } from "./neighborhood.js";
