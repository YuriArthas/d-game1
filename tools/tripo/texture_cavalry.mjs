#!/usr/bin/env node
/**
 * Add Tripo's baked texture to the already generated cavalry mesh.
 *
 * The mesh task is intentionally reused: this task only creates a texture
 * model from the same four views, so geometry and texture can be audited
 * separately before the Blender rigging pass.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const inputRoot = path.resolve(process.env.TRIPO_INPUT_DIR ?? path.join(root, "artifacts/cavalry/tripo/original-lowpoly-001"));
const outputRoot = path.resolve(process.env.TRIPO_TEXTURE_OUTPUT_DIR ?? path.join(inputRoot, "result/texture"));
const baseUrl = (process.env.TRIPO_BASE_URL ?? "https://api.tripo3d.com/v2/openapi").replace(/\/+$/, "");
const apiKey = process.env.TRIPO_API_KEY;
const originalTaskId = process.env.TRIPO_ORIGINAL_TASK_ID ?? "f02c5fb4-1ac3-4930-bf7e-b3e742c85d94";
const existingTaskId = process.env.TRIPO_EXISTING_TASK_ID;
const modelVersion = process.env.TRIPO_TEXTURE_MODEL_VERSION ?? "v3.0-20250812";
const textureQuality = process.env.TRIPO_TEXTURE_QUALITY ?? "standard";
const pollMs = Number(process.env.TRIPO_POLL_MS ?? 5000);
const timeoutMs = Number(process.env.TRIPO_TASK_TIMEOUT_MS ?? 20 * 60 * 1000);
const views = ["front", "left", "back", "right"];

if (!apiKey) throw new Error("TRIPO_API_KEY is required");
if (!Number.isInteger(pollMs) || pollMs < 250) throw new Error("TRIPO_POLL_MS must be >= 250");

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
  if (typeof token !== "string" || token.length === 0) throw new Error(`Tripo upload ${name} did not return a file token`);
  return { type: "png", file_token: token };
}

function inspectGlb(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error("downloaded texture result is not a GLB");
  const jsonLength = buffer.readUInt32LE(12);
  const document = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").trimEnd());
  let triangles = 0;
  for (const mesh of document.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    if ((primitive.mode ?? 4) !== 4) continue;
    const accessor = document.accessors?.[primitive.indices];
    triangles += Math.floor((accessor?.count ?? 0) / 3);
  }
  const images = (document.images ?? []).map(image => ({
    name: image.name ?? null,
    mimeType: image.mimeType ?? null,
    bufferView: image.bufferView ?? null,
  }));
  return { version: buffer.readUInt32LE(4), bytes: buffer.length, triangles, meshes: document.meshes?.length ?? 0,
    materials: document.materials?.length ?? 0, images, textures: document.textures?.length ?? 0,
    nodes: document.nodes?.length ?? 0 };
}

async function main() {
  await mkdir(outputRoot, { recursive: true });
  let taskId = existingTaskId;
  if (!taskId) {
    const files = [];
    for (const name of views) {
      console.log(`uploading ${name}`);
      files.push(await upload(name));
    }
    console.log(`creating texture_model original_model_task_id=${originalTaskId}`);
    const created = await requestJson("/task", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "texture_model",
        original_model_task_id: originalTaskId,
        texture_prompt: { images: files },
        model_version: modelVersion,
        texture_quality: textureQuality,
        texture: true,
        pbr: false,
        texture_alignment: "original_image",
        bake: true,
      }),
    });
    taskId = created.data?.task_id;
    if (typeof taskId !== "string") throw new Error("Tripo texture task response did not contain data.task_id");
  }
  await writeFile(path.join(outputRoot, "task-created.json"), JSON.stringify({ taskId, originalTaskId, modelVersion, textureQuality }, null, 2));
  console.log(`task ${taskId} created`);

  const deadline = Date.now() + timeoutMs;
  let task;
  while (true) {
    if (Date.now() >= deadline) throw new Error(`Tripo texture task ${taskId} timed out after ${timeoutMs}ms`);
    const polled = await requestJson(`/task/${encodeURIComponent(taskId)}`);
    task = polled.data ?? {};
    console.log(`status=${task.status ?? "unknown"} progress=${task.progress ?? "?"}`);
    if (task.status === "success") break;
    if (["failed", "banned", "expired", "cancelled", "unknown"].includes(task.status)) {
      throw new Error(`Tripo texture task ${taskId} ended with ${task.status}: ${task.error_msg ?? "no message"}`);
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  const modelUrl = task.output?.model ?? task.output?.pbr_model ?? task.output?.base_model;
  if (typeof modelUrl !== "string") throw new Error("Tripo texture success response did not contain a model URL");
  const modelResponse = await fetch(modelUrl, { signal: AbortSignal.timeout(5 * 60 * 1000) });
  if (!modelResponse.ok) throw new Error(`Tripo textured GLB download failed: ${modelResponse.status}`);
  const content = Buffer.from(await modelResponse.arrayBuffer());
  await writeFile(path.join(outputRoot, "cavalry-tripo-textured.glb"), content);
  const record = { taskId, originalTaskId, status: task.status, modelVersion, textureQuality, ...inspectGlb(content) };
  await writeFile(path.join(outputRoot, "task-result.json"), JSON.stringify(record, null, 2));
  await writeFile(path.join(outputRoot, "task-response.json"), JSON.stringify({ ...task, output: undefined }, null, 2));
  console.log(`TRIPO_CAVALRY_TEXTURE_COMPLETE ${JSON.stringify(record)}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
