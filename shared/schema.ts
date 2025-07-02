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
  playerName: text("player_name"), // Anonymous player name
  score: integer("score").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  round: integer("round").notNull().default(1),
  totalGuesses: integer("total_guesses").notNull().default(0),
  correctGuesses: integer("correct_guesses").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  usedPeople: text("used_people").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cachedBiographies = pgTable("cached_biographies", {
  id: serial("id").primaryKey(),
  wikipediaUrl: text("wikipedia_url").unique().notNull(),
  name: text("name").notNull(),
  sections: text("sections").array().notNull(),
  hint: text("hint").notNull(),
  initials: text("initials").notNull(),
  extract: text("extract"), // Store the Wikipedia extract for future use
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gameRounds = pgTable("game_rounds", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => gameSessions.id).notNull(),
  personName: text("person_name").notNull(),
  hintUsed: boolean("hint_used").notNull().default(false),
  initialsUsed: boolean("initials_used").notNull().default(false),
  correct: boolean("correct").notNull(),
  pointsEarned: integer("points_earned").notNull(),
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

export const insertCachedBiographySchema = createInsertSchema(cachedBiographies).omit({
  id: true,
  createdAt: true,
});

export const insertGameRoundSchema = createInsertSchema(gameRounds).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type GameSession = typeof gameSessions.$inferSelect;
export type InsertGameSession = z.infer<typeof insertGameSessionSchema>;
export type CachedBiography = typeof cachedBiographies.$inferSelect;
export type InsertCachedBiography = z.infer<typeof insertCachedBiographySchema>;
export type GameRound = typeof gameRounds.$inferSelect;
export type InsertGameRound = z.infer<typeof insertGameRoundSchema>;

export interface WikipediaPerson {
  name: string;
  sections: string[];
  hint: string;
  initials: string;
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
