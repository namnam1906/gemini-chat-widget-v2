import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
    retrieveRelevantDocuments,
    buildRetrievalContext
} from "../../lib/retrieval.js";
import { buildSystemInstruction, getAgentConfig } from "../../config/agent.js";
import { prepareConversationMemory } from "../../lib/memory.js";
import { clearCache } from "../../lib/cache.js";

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    });
}

function buildRagPrompt(userMessage, context) {
    if (!context) {
        return userMessage;
    }

    return `
คำถามของผู้ใช้: ${userMessage}

=========================
ข้อมูลอ้างอิงจากเอกสาร:
=========================
${context}

=========================
คำสั่งเพิ่มเติม:
=========================
- ตอบโดยอิงจาก "ข้อมูลอ้างอิง" เท่านั้น ห้ามเดา
- ถ้าไม่มีข้อมูล ให้ตอบว่า "ไม่พบข้อมูลที่เกี่ยวข้องในเอกสาร กรุณาติดต่อเจ้าหน้าที่การเงิน"
- ตอบเป็นภาษาไทยสุภาพและกระชับ
`.trim();
}

const apiKey = process.env.MY_NEW_GEMINI_KEY || process.env.GEMINI_API_KEY;

export default async (req) => {
    // ✅ เพิ่มตรงนี้
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        });
    }

    let userMessage = "";
    let agentId = "ofas-bot";
    let history = [];

    try {
        if (req.method !== "POST") {
            return jsonResponse({ error: "Method not allowed" }, 405);
        }

        if (!apiKey) {
            return jsonResponse({
                error: "Missing GEMINI API key",
                reply: "ระบบยังไม่ได้ตั้งค่า API key"
            }, 500);
        }

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== "object") {
            return jsonResponse({
                error: "Invalid request body",
                reply: "รูปแบบข้อมูลไม่ถูกต้อง"
            }, 400);
        }

        userMessage = typeof body.message === "string" ? body.message.trim() : "";
        agentId = typeof body.agentId === "string" ? body.agentId : "ofas-bot";
        history = Array.isArray(body.history) ? body.history : [];

        console.log("[chat] incoming message =", userMessage);
        console.log("[chat] history length =", history.length);

        if (!userMessage) {
            return jsonResponse({ reply: "กรุณาพิมพ์ข้อความก่อนส่ง" }, 400);
        }

        if (userMessage === "/refresh") {
            clearCache("knowledge-base");
            return jsonResponse({
                reply: "รีเฟรชข้อมูลเรียบร้อยแล้ว",
                sources: []
            });
        }

        const agent = getAgentConfig(agentId);

        let relevantDocs = [];
        let retrievalContext = "";

        try {
            relevantDocs = await retrieveRelevantDocuments(userMessage, {
                topK: 3,
                minScore: 1
            });
            retrievalContext = buildRetrievalContext(relevantDocs);
            console.log("[chat] relevantDocs =", relevantDocs.length);
        } catch (retrievalError) {
            console.error("[chat] retrieval error:", retrievalError);
        }

        const { geminiContents } = prepareConversationMemory(
            history,
            agent.maxHistoryMessages
        );

        const validHistory = (geminiContents || []).filter((item) =>
            item &&
            item.role &&
            Array.isArray(item.parts) &&
            item.parts[0] &&
            item.parts[0].text
        );

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: buildSystemInstruction()
        });

        const chat = model.startChat({
            history: validHistory,
            generationConfig: {
                maxOutputTokens: 1000
            }
        });

        const prompt = buildRagPrompt(userMessage, retrievalContext);
        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        const replyText = response.text();

        return jsonResponse({
            reply: replyText?.trim() || agent.fallbackMessage,
            sources: relevantDocs.map((doc) => ({
                name: doc.name,
                url: doc.webViewLink
            })),
            meta: {
                usedModel: "gemini-2.5-flash",
                sourceCount: relevantDocs.length,
                historyCount: validHistory.length
            }
        });
    } catch (error) {
        console.error("[chat] fatal error:", error);

        if (String(error?.message || "").toLowerCase().includes("role")) {
            try {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    systemInstruction: buildSystemInstruction()
                });

                const result = await model.generateContent(
                    buildRagPrompt(userMessage || "", "")
                );
                const response = await result.response;

                return jsonResponse({
                    reply: response.text()?.trim() || "ขออภัย ระบบขัดข้องเรื่องลำดับข้อความ",
                    sources: []
                });
            } catch (retryError) {
                console.error("[chat] retry without history failed:", retryError);
            }
        }

        return jsonResponse({
            error: error?.message || "Unknown server error",
            reply: "ขออภัยครับ ระบบขัดข้องชั่วคราว"
        }, 500);
    }
};