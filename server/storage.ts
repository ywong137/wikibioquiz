import { 
  users, 
  gameSessions, 
  cachedBiographies, 
  gameRounds,
  famousPeople,
  type User, 
  type InsertUser, 
  type GameSession, 
  type InsertGameSession,
  type CachedBiography,
  type InsertCachedBiography,
  type GameRound,
  type InsertGameRound,
  type FamousPerson,
  type InsertFamousPerson
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createGameSession(session: InsertGameSession): Promise<GameSession>;
  updateGameSession(id: number, session: Partial<InsertGameSession>): Promise<GameSession | undefined>;
  getGameSession(id: number): Promise<GameSession | undefined>;
  
  // Biography caching
  getCachedBiography(url: string): Promise<CachedBiography | undefined>;
  addCachedBiography(biography: InsertCachedBiography): Promise<CachedBiography>;
  getRandomCachedBiographies(excludeNames: string[], limit: number): Promise<CachedBiography[]>;
  getCachedBiographyCount(): Promise<number>;
  
  // Game rounds
  addGameRound(round: InsertGameRound): Promise<GameRound>;
  
  // Famous people database
  getRandomFamousPerson(excludeNames: string[]): Promise<FamousPerson | undefined>;
  getFamousPersonCount(): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private gameSessions: Map<number, GameSession>;
  private currentUserId: number;
  private currentSessionId: number;

  constructor() {
    this.users = new Map();
    this.gameSessions = new Map();
    this.currentUserId = 1;
    this.currentSessionId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createGameSession(insertSession: InsertGameSession): Promise<GameSession> {
    const id = this.currentSessionId++;
    const session: GameSession = {
      ...insertSession,
      id,
      createdAt: new Date(),
    };
    this.gameSessions.set(id, session);
    return session;
  }

  async updateGameSession(id: number, updates: Partial<InsertGameSession>): Promise<GameSession | undefined> {
    const existing = this.gameSessions.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.gameSessions.set(id, updated);
    return updated;
  }

  async getGameSession(id: number): Promise<GameSession | undefined> {
    return this.gameSessions.get(id);
  }

  // Biography caching - stub implementations for now, will be replaced with database
  async getCachedBiography(url: string): Promise<CachedBiography | undefined> {
    return undefined; // No caching in memory storage
  }

  async addCachedBiography(biography: InsertCachedBiography): Promise<CachedBiography> {
    // Create a fake cached biography for interface compliance
    return {
      id: 1,
      ...biography,
      createdAt: new Date(),
    };
  }

  async getRandomCachedBiographies(excludeNames: string[], limit: number): Promise<CachedBiography[]> {
    return []; // No cached biographies in memory storage
  }

  async getCachedBiographyCount(): Promise<number> {
    return 0; // No cached biographies in memory storage
  }

  async addGameRound(round: InsertGameRound): Promise<GameRound> {
    // Create a fake game round for interface compliance
    return {
      id: 1,
      ...round,
      createdAt: new Date(),
    };
  }

  async getRandomFamousPerson(excludeNames: string[]): Promise<FamousPerson | undefined> {
    // For MemStorage, return undefined to indicate database storage needed
    return undefined;
  }

  async getFamousPersonCount(): Promise<number> {
    // For MemStorage, return 0 to indicate database storage needed
    return 0;
  }
}

// Database storage implementation with PostgreSQL
import { db } from "./db";
import { eq, and, notInArray, sql } from "drizzle-orm";

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createGameSession(insertSession: InsertGameSession): Promise<GameSession> {
    const [session] = await db
      .insert(gameSessions)
      .values(insertSession)
      .returning();
    return session;
  }

  async updateGameSession(id: number, updates: Partial<InsertGameSession>): Promise<GameSession | undefined> {
    const [session] = await db
      .update(gameSessions)
      .set(updates)
      .where(eq(gameSessions.id, id))
      .returning();
    return session || undefined;
  }

  async getGameSession(id: number): Promise<GameSession | undefined> {
    const [session] = await db.select().from(gameSessions).where(eq(gameSessions.id, id));
    return session || undefined;
  }

  async getCachedBiography(url: string): Promise<CachedBiography | undefined> {
    const [biography] = await db.select().from(cachedBiographies).where(eq(cachedBiographies.wikipediaUrl, url));
    return biography || undefined;
  }

  async addCachedBiography(biography: InsertCachedBiography): Promise<CachedBiography> {
    const [result] = await db
      .insert(cachedBiographies)
      .values(biography)
      .returning();
    return result;
  }

  async getRandomCachedBiographies(excludeNames: string[], limit: number): Promise<CachedBiography[]> {
    let query = db.select().from(cachedBiographies);
    
    if (excludeNames.length > 0) {
      query = query.where(notInArray(cachedBiographies.name, excludeNames));
    }
    
    return await query.limit(limit);
  }

  async getCachedBiographyCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(cachedBiographies);
    return result.count;
  }

  async addGameRound(round: InsertGameRound): Promise<GameRound> {
    const [result] = await db
      .insert(gameRounds)
      .values(round)
      .returning();
    return result;
  }

  // Famous people database methods
  async getRandomFamousPerson(excludeNames: string[]): Promise<FamousPerson | undefined> {
    let query = db.select().from(famousPeople);
    
    if (excludeNames.length > 0) {
      query = query.where(notInArray(famousPeople.name, excludeNames));
    }
    
    // Get random person using ORDER BY RANDOM()
    query = query.orderBy(sql`RANDOM()`).limit(1);
    
    const [person] = await query;
    return person || undefined;
  }

  async getFamousPersonCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(famousPeople);
    return result.count;
  }
}

export const storage = new DatabaseStorage();
