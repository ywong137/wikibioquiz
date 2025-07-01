import { users, gameSessions, type User, type InsertUser, type GameSession, type InsertGameSession } from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createGameSession(session: InsertGameSession): Promise<GameSession>;
  updateGameSession(id: number, session: Partial<InsertGameSession>): Promise<GameSession | undefined>;
  getGameSession(id: number): Promise<GameSession | undefined>;
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
}

export const storage = new MemStorage();
