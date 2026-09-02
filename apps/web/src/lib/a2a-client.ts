import { apiUrl } from "./api-base";

export async function a2aGet<T>(
  path: string,
): Promise<{ data: T; status: number; durationMs: number }> {
  const started = performance.now();
  const res = await fetch(apiUrl(path), { cache: "no-store" });
  const durationMs = Math.round(performance.now() - started);
  const data = (await res.json()) as T;
  return { data, status: res.status, durationMs };
}

export async function a2aPost<T>(
  path: string,
  body: unknown,
): Promise<{ data: T; status: number; durationMs: number }> {
  const started = performance.now();
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const durationMs = Math.round(performance.now() - started);
  const data = (await res.json()) as T;
  return { data, status: res.status, durationMs };
}
