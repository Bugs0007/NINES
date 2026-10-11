import containerizeApp from "./missions/containerize-app";
import ghActions from "./missions/gh-actions";
import loadTest from "./missions/load-test";
import mcpServer from "./missions/mcp-server";
import searchEvals from "./missions/search-evals";
import telegramSummarizer from "./missions/telegram-summarizer";
import type { FieldMission } from "./types";

export const FIELD_MISSIONS: FieldMission[] = [loadTest, telegramSummarizer, searchEvals, mcpServer, containerizeApp, ghActions];
export const FIELD_BY_ID: ReadonlyMap<string, FieldMission> = new Map(FIELD_MISSIONS.map((m) => [m.id, m]));
