#!/usr/bin/env node
/**
 * One-shot Tripo multiview generation for the cavalry review asset.
 *
 * It follows the RAB mesh generator contract: upload front/left/back/right
 * PNGs, create a multiview_to_model task with a 5000-face budget, poll it, and
 * save the resulting GLB plus a redacted task record. The API key is read only
 * from the environment and is never written to disk or printed.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const inputRoot = path.resolve(process.env.TRIPO_INPUT_DIR ?? path.join(root, "artifacts/cavalry/tripo"));
const outputRoot = path.resolve(process.env.TRIPO_OUTPUT_DIR ?? path.join(inputRoot, "result"));
const baseUrl = (process.env.TRIPO_BASE_URL ?? "https://api.tripo3d.com/v2/openapi").replace(/\/+$/, "");
const apiKey = process.env.TRIPO_API_KEY;
const modelVersion = process.env.TRIPO_MODEL_VERSION ?? "P1-20260311";
const faceLimit = Number(process.env.TRIPO_FACE_LIMIT ?? 5000);
const pollMs = Number(process.env.TRIPO_POLL_MS ?? 5000);
const timeoutMs = Number(process.env.TRIPO_TASK_TIMEOUT_MS ?? 20 * 60 * 1000);

if (!apiKey) throw new Error("TRIPO_API_KEY is required");
if (!Number.isInteger(faceLimit) || faceLimit < 48 || faceLimit > 20_000) {
  throw new Error(`TRIPO_FACE_LIMIT must be an integer from 48 to 20000, got ${faceLimit}`);
}

const views = ["front", "left", "back", "right"];

async function requestJson(endpoint, init = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(5 * 60 * 1000),
  });
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch {
    throw new Error(`Tripo ${endpoint} returned non-JSON (${response.status})`);
  }
  if (!response.ok || (value && value.code && value.code !== 0)) {
    throw new Error(`Tripo ${endpoint} failed (${response.status}): ${JSON.stringify(value).slice(0, 2000)}`);
  }
  return value;
}

async function upload(name) {
  const content = await readFile(path.join(inputRoot, `${name}.png`));
  const form = new FormData();
  form.append("file", new Blob([content], { type: "image/png" }), `${name}.png`);
  const response = await requestJson("/upload/sts", { method: "POST", body: form });
  const data = response.data ?? {};
  const token = data.image_token ?? data.file_token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error(`Tripo upload ${name} did not return an image/file token`);
  }
  return { type: "png", file_token: token };
}

function triangleCount(document) {
  let total = 0;
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.mode !== undefined && primitive.mode !== 4) continue;
      const accessor = document.accessors?.[primitive.indices];
      if (accessor?.count) total += Math.floor(accessor.count / 3);
    }
  }
  return total || null;
}

async function main() {
  await mkdir(outputRoot, { recursive: true });
  const files = [];
  for (const name of views) {
    console.log(`uploading ${name}`);
    files.push(await upload(name));
  }
  console.log(`creating multiview_to_model face_limit=${faceLimit}`);
  const created = await requestJson("/task", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "multiview_to_model",
      model_version: modelVersion,
      files,
      face_limit: faceLimit,
      texture: false,
      pbr: false,
      export_uv: true,
    }),
  });
  const taskId = created.data?.task_id;
  if (typeof taskId !== "string") throw new Error("Tripo task response did not contain data.task_id");
  await writeFile(path.join(outputRoot, "task-created.json"), JSON.stringify({ taskId, modelVersion, faceLimit }, null, 2));
  console.log(`task ${taskId} created`);

  const deadline = Date.now() + timeoutMs;
  let task;
  while (true) {
    if (Date.now() >= deadline) throw new Error(`Tripo task ${taskId} timed out after ${timeoutMs}ms`);
    const polled = await requestJson(`/task/${encodeURIComponent(taskId)}`);
    task = polled.data ?? {};
    console.log(`status=${task.status ?? "unknown"}`);
    if (task.status === "success") break;
    if (["failed", "banned", "expired", "cancelled", "unknown"].includes(task.status)) {
      throw new Error(`Tripo task ${taskId} ended with ${task.status}: ${task.error_msg ?? "no message"}`);
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  const modelUrl = task.output?.model ?? task.output?.base_model ?? task.output?.pbr_model;
  if (typeof modelUrl !== "string") throw new Error("Tripo success response did not contain a model URL");
  const modelResponse = await fetch(modelUrl, { signal: AbortSignal.timeout(5 * 60 * 1000) });
  if (!modelResponse.ok) throw new Error(`Tripo GLB download failed: ${modelResponse.status}`);
  const content = Buffer.from(await modelResponse.arrayBuffer());
  await writeFile(path.join(outputRoot, "cavalry-tripo.glb"), content);
  const jsonLength = content.readUInt32LE(12);
  const document = JSON.parse(content.subarray(20, 20 + jsonLength).toString("utf8").trimEnd());
  const record = {
    taskId,
    status: task.status,
    modelVersion,
    faceLimit,
    bytes: content.length,
    triangles: triangleCount(document),
    meshes: document.meshes?.length ?? 0,
    materials: document.materials?.length ?? 0,
    nodes: document.nodes?.length ?? 0,
  };
  await writeFile(path.join(outputRoot, "task-result.json"), JSON.stringify(record, null, 2));
  await writeFile(path.join(outputRoot, "task-response.json"), JSON.stringify({ ...task, output: undefined }, null, 2));
  console.log(`TRIPO_CAVALRY_COMPLETE ${JSON.stringify(record)}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
