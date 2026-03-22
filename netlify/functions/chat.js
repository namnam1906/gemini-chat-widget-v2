import "dotenv/config";
import {
    retrieveRelevantDocuments,
    buildRetrievalContext
} from "../../lib/retrieval.js";
import { GoogleGenAI } from "@google/genai";
import { buildSystemInstruction, getAgentConfig } from "../../config/agent.js";
import { prepareConversationMemory } from "../../lib/memory.js";

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json"
        }
    });
}

// function buildUserPrompt(userMessage) {
//     return `คำถามของผู้ใช้:\n${userMessage}`.trim();
// }

function buildRagPrompt(userMessage, context) {
    return `
คุณคือผู้ช่วยเจ้าหน้าที่การเงิน

คำถามของผู้ใช้:
${userMessage}

=========================
ข้อมูลอ้างอิงจากเอกสาร:
=========================
${context || "ไม่มีข้อมูลที่เกี่ยวข้อง"}

=========================
คำสั่ง:
=========================
- ให้ตอบโดยอิงจาก "ข้อมูลอ้างอิง" เท่านั้น
- ห้ามเดาข้อมูล
- ถ้าไม่มีข้อมูล ให้ตอบว่า:
  "ไม่พบข้อมูลที่เกี่ยวข้องในเอกสาร กรุณาติดต่อเจ้าหน้าที่ HR"
- ตอบเป็นภาษาไทยสุภาพ
- ถ้าเป็นขั้นตอน ให้ตอบเป็นข้อ ๆ
`.trim();
}

export default async (req, context) => {
    try {
        if (req.method !== "POST") {
            return jsonResponse({ error: "Method not allowed" }, 405);
        }

        if (!process.env.GEMINI_API_KEY) {
            return jsonResponse({ reply: "ระบบยังไม่ได้ตั้งค่า API key" }, 500);
        }

        const body = await req.json().catch(() => null);

        if (!body || typeof body !== "object") {
            return jsonResponse({ reply: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
        }

        const {
            message = "",
            history = [],
            agentId = "ofas-bot"
        } = body;

        const userMessage = typeof message === "string" ? message.trim() : "";

        // 🔥 STEP: Retrieval จาก Google Drive
        const relevantDocs = await retrieveRelevantDocuments(userMessage, {
            topK: 3,
            minScore: 1
        });

        const retrievalContext = buildRetrievalContext(relevantDocs);

        if (!userMessage) {
            return jsonResponse({ reply: "กรุณาพิมพ์ข้อความก่อนส่ง" }, 400);
        }

        const agent = getAgentConfig(agentId);

        const { geminiContents, trimmed } = prepareConversationMemory(
            history,
            agent.maxHistoryMessages
        );

        const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY
        });

        console.log("USING API KEY FROM chat.js =", process.env.GEMINI_API_KEY?.slice(0, 12));

        console.log("=== USER QUESTION ===");
        console.log(userMessage);

        console.log("=== RETRIEVED DOCS ===");
        console.log(relevantDocs.map(d => ({
            name: d.name,
            score: d.score
        })));

        console.log("=== CONTEXT ===");
        console.log(retrievalContext.slice(0, 500));

        // 🔥 เรียก Gemini
        const response = await ai.models.generateContent({
            model: agent.model,
            config: {
                systemInstruction: buildSystemInstruction()
            },
            contents: [
                ...geminiContents,
                {
                    role: "user",
                    // parts: [{ text: buildUserPrompt(userMessage) }]
                    parts: [
                        {
                            text: buildRagPrompt(userMessage, retrievalContext)
                        }
                    ]
                }
            ]
        });

        const reply =
            typeof response.text === "string" && response.text.trim()
                ? response.text.trim()
                : agent.fallbackMessage;

        return jsonResponse({
            reply,
            meta: {
                agentId: agent.id,
                agentName: agent.name,
                usedModel: agent.model,
                memoryCount: trimmed.length
            }
        });
    } catch (error) {
        console.error("Chat function error:", error);
        console.error("Gemini call failed");

        const fallbackAgent = getAgentConfig("ofas-bot");

        return jsonResponse(
            {
                reply: fallbackAgent.fallbackMessage,
                error: "internal_error"
            },
            500
        );
    }
};