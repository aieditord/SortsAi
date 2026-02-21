import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import archiver from "archiver";
import fs from "fs";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // YouTube OAuth URL generation
  app.get("/api/auth/youtube/url", (req, res) => {
    const redirectUri = `${process.env.APP_URL}/auth/youtube/callback`;
    const params = new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
      access_type: "offline",
      prompt: "consent",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    res.json({ url: authUrl });
  });

  // YouTube OAuth Callback
  app.get("/auth/youtube/callback", async (req, res) => {
    const { code } = req.query;
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'YOUTUBE_AUTH_SUCCESS', code: '${code}' }, '*');
              window.close();
            } else {
              window.location.href = '/?youtube_success=true';
            }
          </script>
          <p>Authentication successful. Redirecting...</p>
        </body>
      </html>
    `);
  });

  // Endpoint to download project source as ZIP
  app.get("/api/download-source", (req, res) => {
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    res.attachment('shorts-ai-source.zip');

    archive.on('error', (err) => {
      res.status(500).send({ error: err.message });
    });

    archive.pipe(res);

    // Add files and directories
    const rootDir = process.cwd();
    
    // Add src folder
    archive.directory(path.join(rootDir, 'src/'), 'src');
    
    // Add individual files
    const filesToInclude = [
      'package.json',
      'server.ts',
      'vite.config.ts',
      'tsconfig.json',
      'index.html',
      '.gitignore',
      '.env.example',
      'metadata.json'
    ];

    filesToInclude.forEach(file => {
      const filePath = path.join(rootDir, file);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file });
      }
    });

    archive.finalize();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: Serve static files from the dist folder
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();


