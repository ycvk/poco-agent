"use server";

import { z } from "zod";
import { chatService } from "@/features/chat/services/chat-service";

const createSessionSchema = z.object({
  prompt: z.string().trim().min(1, "请输入任务内容"),
  userId: z.string().optional(),
});

const sendMessageSchema = z.object({
  sessionId: z.string().trim().min(1, "缺少会话 ID"),
  content: z.string().trim().min(1, "请输入消息内容"),
  userId: z.string().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export async function createSessionAction(input: CreateSessionInput) {
  const { prompt, userId } = createSessionSchema.parse(input);
  const result = await chatService.createSession(prompt, userId);
  return {
    sessionId: result.session_id,
    runId: result.run_id,
    status: result.status,
  };
}

export async function sendMessageAction(input: SendMessageInput) {
  const { sessionId, content, userId } = sendMessageSchema.parse(input);
  const result = await chatService.sendMessage(sessionId, content, userId);
  return {
    sessionId: result.session_id,
    runId: result.run_id,
    status: result.status,
  };
}
