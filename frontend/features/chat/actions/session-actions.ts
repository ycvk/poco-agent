"use server";

import { z } from "zod";
import { chatService } from "@/features/chat/services/chat-service";

const inputFileSchema = z.object({
  id: z.string(),
  type: z.literal("file"),
  name: z.string(),
  source: z.string(),
  size: z.number(),
  content_type: z.string(),
  path: z.string(),
});

const configSchema = z.object({
  repo_url: z.string().optional(),
  git_branch: z.string().optional(),
  mcp_config: z.record(z.string(), z.unknown()).optional(),
  skill_files: z.record(z.string(), z.unknown()).optional(),
  input_files: z.array(inputFileSchema).optional(),
});

const createSessionSchema = z.object({
  prompt: z.string().trim().min(1, "请输入任务内容"),
  config: configSchema.optional(),
});

const sendMessageSchema = z.object({
  sessionId: z.string().trim().min(1, "缺少会话 ID"),
  content: z.string().trim().min(1, "请输入消息内容"),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export async function createSessionAction(input: CreateSessionInput) {
  console.log("input", input);
  // const { prompt, config } = createSessionSchema.parse(input);
  // console.log("prompt", prompt);
  const prompt = "123";
  const result = await chatService.createSession(prompt);
  console.log("result", result);
  return {
    sessionId: result.session_id,
    runId: result.run_id,
    status: result.status,
  };
}

export async function sendMessageAction(input: SendMessageInput) {
  const { sessionId, content } = sendMessageSchema.parse(input);
  const result = await chatService.sendMessage(sessionId, content);
  return {
    sessionId: result.session_id,
    runId: result.run_id,
    status: result.status,
  };
}

