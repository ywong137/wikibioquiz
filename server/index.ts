import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Utility function to get the base URL from request or environment
function getBaseUrl(req: Request): string {
  // For production deployment, use the known production URL
  if (process.env.NODE_ENV === "production") {
    return "https://wiki-bio-quiz.replit.app";
  }
  
  // For development, check if we have Replit domain info
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS}`;
  }
  
  // Fallback to request headers
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host || 'localhost:5000';
  return `${protocol}://${host}`;
}

// Create a route to serve processed HTML for the root path (production only)
function createProcessedHtmlRoute(app: express.Express) {
  // Only add this route in production, let Vite handle development
  if (app.get("env") !== "development") {
    app.get('/', (req, res) => {
      const baseUrl = getBaseUrl(req);
      const htmlPath = path.resolve(import.meta.dirname, '..', 'dist', 'public', 'index.html');
      
      fs.readFile(htmlPath, 'utf-8', (err, data) => {
        if (err) {
          return res.status(500).send('Error loading page');
        }
        
        const processedHtml = data.replace(
          /content="\/social-preview\.png"/g,
          `content="${baseUrl}/social-preview.png"`
        );
        
        res.set('Content-Type', 'text/html').send(processedHtml);
      });
    });
  }
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Add HTML processing route before Vite/static serving
  createProcessedHtmlRoute(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
