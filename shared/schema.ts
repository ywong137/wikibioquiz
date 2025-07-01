import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const gameSessions = pgTable("game_sessions", {
  id: serial("id").primaryKey(),
  score: integer("score").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  round: integer("round").notNull().default(1),
  totalGuesses: integer("total_guesses").notNull().default(0),
  correctGuesses: integer("correct_guesses").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  usedPeople: text("used_people").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertGameSessionSchema = createInsertSchema(gameSessions).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type GameSession = typeof gameSessions.$inferSelect;
export type InsertGameSession = z.infer<typeof insertGameSessionSchema>;

export interface WikipediaPerson {
  name: string;
  sections: string[];
  hint: string;
  url: string;
}

export interface GameState {
  session: GameSession;
  currentPerson: WikipediaPerson | null;
  isLoading: boolean;
  showFeedback: boolean;
  lastGuessCorrect: boolean;
  pointsEarned: number;
}
