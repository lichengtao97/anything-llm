import { RESUME_PROTOCOL_MARKER } from "./resumeDialogue";

const STORAGE_PREFIX = "resume-workspace";
const RESUME_ARRAY_FIELDS = [
  "experience",
  "projects",
  "education",
  "skills",
  "certificates",
];
const RESUME_OBJECT_FIELDS = ["basics"];
const RESUME_STRING_FIELDS = ["summary"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function blankResume() {
  return {
    basics: {},
    summary: "",
    experience: [],
    projects: [],
    education: [],
    skills: [],
    certificates: [],
  };
}

function getStorageKey(slug, threadSlug = null) {
  return `${STORAGE_PREFIX}:${slug}:${threadSlug || "default"}`;
}

function normalizeJsonCandidate(value = "") {
  return value.trim().replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(normalizeJsonCandidate(value));
    } catch {
      return null;
    }
  }
}

export function loadStoredResume(slug, threadSlug = null) {
  if (!slug || typeof window === "undefined") return blankResume();

  const stored = window.localStorage.getItem(getStorageKey(slug, threadSlug));
  const parsed = stored ? safeJsonParse(stored) : null;
  if (!parsed || typeof parsed !== "object") return blankResume();

  return mergeResumeData(blankResume(), parsed);
}

export function persistResume(slug, threadSlug = null, resume) {
  if (!slug || typeof window === "undefined") return;
  window.localStorage.setItem(
    getStorageKey(slug, threadSlug),
    JSON.stringify(resume)
  );
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== "";
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => hasValue(entryValue))
  );
}

function upsertArrayItems(existing = [], incoming = [], matcher) {
  const merged = [...existing];

  for (const item of incoming) {
    if (!item || typeof item !== "object") continue;
    const compactItem = compactObject(item);
    const index = merged.findIndex((current) => matcher(current, compactItem));

    if (index === -1) {
      merged.push(compactItem);
      continue;
    }

    merged[index] = {
      ...merged[index],
      ...compactItem,
    };
  }

  return merged;
}

function mergeArrayField(field, existing = [], incoming = [], action) {
  if (action === "replace") return incoming;

  if (field === "skills" || field === "certificates") {
    return uniqueStrings([...existing, ...incoming]);
  }

  if (field === "experience") {
    return upsertArrayItems(existing, incoming, (left, right) => {
      const sameCompany =
        left.company && right.company && left.company === right.company;
      const sameRole = left.role && right.role && left.role === right.role;
      const samePeriod =
        left.period && right.period && left.period === right.period;
      return (
        (sameCompany && (sameRole || samePeriod)) || (sameRole && samePeriod)
      );
    });
  }

  if (field === "education") {
    return upsertArrayItems(existing, incoming, (left, right) => {
      const sameSchool =
        left.school && right.school && left.school === right.school;
      const sameMajor = left.major && right.major && left.major === right.major;
      const samePeriod =
        left.period && right.period && left.period === right.period;
      return sameSchool && (sameMajor || samePeriod);
    });
  }

  if (field === "projects") {
    return upsertArrayItems(existing, incoming, (left, right) => {
      return left.name && right.name && left.name === right.name;
    });
  }

  return incoming;
}

export function mergeResumeData(currentResume, incomingData, action = "merge") {
  if (!incomingData || typeof incomingData !== "object") return currentResume;

  const mergeAction = incomingData.__action || action;
  const nextResume = clone(
    incomingData.__replace === true
      ? blankResume()
      : currentResume || blankResume()
  );

  for (const field of RESUME_OBJECT_FIELDS) {
    if (incomingData[field] && typeof incomingData[field] === "object") {
      nextResume[field] = {
        ...(nextResume[field] || {}),
        ...incomingData[field],
      };
    }
  }

  for (const field of RESUME_STRING_FIELDS) {
    if (typeof incomingData[field] === "string") {
      nextResume[field] = incomingData[field];
    }
  }

  for (const field of RESUME_ARRAY_FIELDS) {
    if (Array.isArray(incomingData[field])) {
      nextResume[field] = mergeArrayField(
        field,
        nextResume[field] || [],
        incomingData[field],
        mergeAction
      );
    }
  }

  return nextResume;
}

function jsonCandidatesFromText(text = "") {
  const candidates = [];
  const commentPattern = new RegExp(
    `<!\\s*(?:--|[–—−])\\s*${RESUME_PROTOCOL_MARKER}\\s*([\\s\\S]*?)\\s*(?:--|[–—−])\\s*>`,
    "gi"
  );
  const renderFencePattern = /```json:render\s*([\s\S]*?)```/gi;
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;

  while ((match = commentPattern.exec(text)) !== null) {
    candidates.push(match[1]);
  }

  while ((match = renderFencePattern.exec(text)) !== null) {
    candidates.push(match[1]);
  }

  while ((match = fencePattern.exec(text)) !== null) {
    candidates.push(match[1]);
  }

  const markerIndex = text.indexOf(RESUME_PROTOCOL_MARKER);
  if (markerIndex !== -1) {
    const markerText = text.slice(markerIndex + RESUME_PROTOCOL_MARKER.length);
    const firstMarkerObject = markerText.indexOf("{");
    const lastMarkerObject = markerText.lastIndexOf("}");
    if (firstMarkerObject >= 0 && lastMarkerObject > firstMarkerObject) {
      candidates.push(
        markerText.slice(firstMarkerObject, lastMarkerObject + 1)
      );
    }
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    candidates.push(trimmed);
  }

  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    candidates.push(trimmed.slice(firstObject, lastObject + 1));
  }

  return candidates;
}

export function extractResumeUpdate(text = "") {
  for (const candidate of jsonCandidatesFromText(text)) {
    const parsed = safeJsonParse(candidate);
    if (!parsed) continue;

    if (
      parsed.type === "resume" &&
      parsed.data &&
      typeof parsed.data === "object"
    ) {
      return {
        ...parsed.data,
        __action: parsed.action === "replace" ? "replace" : "merge",
        __stage: parsed.stage,
      };
    }

    if (parsed.action !== "update_resume") continue;

    const data = parsed.data?.resume || parsed.data;
    if (data && typeof data === "object") {
      return {
        ...data,
        __replace:
          parsed.mode === "replace" ||
          parsed.replace === true ||
          data.replaceExisting === true,
      };
    }
  }

  return null;
}

export function stripResumeUpdatePayload(text = "") {
  const commentPattern = new RegExp(
    `<!\\s*(?:--|[–—−])\\s*${RESUME_PROTOCOL_MARKER}\\s*[\\s\\S]*?\\s*(?:--|[–—−])\\s*>`,
    "gi"
  );
  const renderFencePattern = /```json:render\s*[\s\S]*?```/gi;
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  const cleaned = text
    .replace(commentPattern, "")
    .replace(renderFencePattern, "")
    .replace(fencePattern, (match, body) => {
      const parsed = safeJsonParse(body);
      return parsed?.action === "update_resume" || parsed?.type === "resume"
        ? ""
        : match;
    })
    .trim();
  const withoutInlineJson = stripInlineResumeJson(cleaned);

  if (withoutInlineJson) return withoutInlineJson;
  return extractResumeUpdate(text) ? "简历预览已更新。" : text;
}

function stripInlineResumeJson(text = "") {
  const markerIndex = text.indexOf(RESUME_PROTOCOL_MARKER);
  if (markerIndex === -1) return text.trim();

  const start = text.lastIndexOf("<!", markerIndex);
  const blockStart = start === -1 ? markerIndex : start;
  const block = text.slice(blockStart);
  if (!extractResumeUpdate(block)) return text.trim();

  return text.slice(0, blockStart).trim();
}
