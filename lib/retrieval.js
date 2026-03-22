// lib/retrieval.js

import { loadReadableDriveDocumentsRecursive } from "./drive.js";

function normalizeText(text = "") {
    return String(text)
        .toLowerCase()
        .replace(/\r/g, " ")
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokenize(text = "") {
    const normalized = normalizeText(text);

    return normalized
        .split(/[\s,.;:!?()[\]{}"'/\\|<>@#$%^&*+=~-]+/)
        .map((token) => token.trim())
        .filter(Boolean);
}

function toKeywordSet(text = "") {
    return new Set(tokenize(text));
}

function scoreDocument(query, document) {
    const queryKeywords = toKeywordSet(query);
    const docText = `${document.name} ${document.path} ${document.text}`;
    const docKeywords = toKeywordSet(docText);

    let score = 0;

    for (const keyword of queryKeywords) {
        if (docKeywords.has(keyword)) {
            score += 1;
        }
    }

    const normalizedDocText = normalizeText(docText);
    const normalizedQuery = normalizeText(query);

    if (normalizedQuery && normalizedDocText.includes(normalizedQuery)) {
        score += 5;
    }

    if (document.name && normalizeText(document.name).includes(normalizedQuery)) {
        score += 3;
    }

    return score;
}

function extractPreview(text = "", maxLength = 1200) {
    const normalized = String(text).trim();

    if (normalized.length <= maxLength) {
        return normalized;
    }

    return normalized.slice(0, maxLength).trim() + "...";
}

export async function loadKnowledgeBase(options = {}) {
    const documents = await loadReadableDriveDocumentsRecursive(options);

    return documents.map((doc) => ({
        ...doc,
        normalizedText: normalizeText(doc.text),
        preview: extractPreview(doc.text)
    }));
}

export async function retrieveRelevantDocuments(
    query,
    {
        topK = 3,
        minScore = 1,
        driveOptions = {}
    } = {}
) {
    const knowledgeBase = await loadKnowledgeBase(driveOptions);

    const scored = knowledgeBase
        .map((doc) => ({
            ...doc,
            score: scoreDocument(query, doc)
        }))
        .filter((doc) => doc.score >= minScore)
        .sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
}

export function buildRetrievalContext(documents = []) {
    if (!Array.isArray(documents) || documents.length === 0) {
        return "";
    }

    return documents
        .map((doc, index) => {
            return [
                `[เอกสารอ้างอิง ${index + 1}]`,
                `ชื่อไฟล์: ${doc.name}`,
                `พาธ: ${doc.path}`,
                `อัปเดตล่าสุด: ${doc.modifiedTime || "-"}`,
                `คะแนนความเกี่ยวข้อง: ${doc.score ?? "-"}`,
                `เนื้อหา:`,
                doc.preview || ""
            ].join("\n");
        })
        .join("\n\n");
}