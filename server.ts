import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { instagramGetUrl } from "instagram-url-direct";
import ExcelJS from "exceljs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.post("/api/get-video-url", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      console.log(`Searching for video URL: ${url}`);
      // Using built-in retries of the library
      const results = await instagramGetUrl(url, { retries: 2, delay: 2000 });
      
      if (results && results.url_list && results.url_list.length > 0) {
        res.json({ videoUrl: results.url_list[0], type: "video/mp4" });
      } else {
        throw new Error("Could not find direct video link.");
      }
    } catch (error: any) {
      console.error("Scraper error:", error);
      res.status(500).json({ error: error.message || "Failed to extract video URL" });
    }
  });

  app.post("/api/export", async (req, res) => {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).json({ error: "Data is required" });

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Transcripts");

      worksheet.columns = [
        { header: "URL", key: "url", width: 50 },
        { header: "Transcript", key: "transcript", width: 100 },
      ];

      data.forEach(item => {
        worksheet.addRow(item);
      });

      // Style headers
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { horizontal: 'center' };

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=transcripts.xlsx"
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Failed to generate Excel file" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
