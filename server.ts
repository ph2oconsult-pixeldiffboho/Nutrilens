import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase limit for potential large payloads (like photos if ever needed)
  app.use(express.json({ limit: '10mb' }));

  // --- API Routes ---

  app.post("/api/day-summary", (req, res) => {
    const { meals, targets } = req.body;
    if (!meals || !targets) return res.status(400).json({ error: "Meals and targets are required" });

    const summary = meals.reduce((acc: any, meal: any) => {
      acc.calories += meal.totalCalories.precise;
      acc.upperBoundCals += meal.totalCalories.max;
      acc.protein += meal.totalProtein.precise;
      return acc;
    }, { calories: 0, upperBoundCals: 0, protein: 0 });

    const remainingCals = targets.calories - summary.calories;
    const safeRemaining = targets.calories - summary.upperBoundCals;

    res.json({
      ...summary,
      remainingCals,
      safeRemaining,
      calPercent: (summary.calories / targets.calories) * 100
    });
  });

  app.post("/api/guidance", (req, res) => {
    const { summary, targets } = req.body;
    if (!summary || !targets) return res.status(400).json({ error: "Summary and targets are required" });

    const { calories, upperBoundCals, protein } = summary;
    const remaining = targets.calories - calories;
    const safeRemaining = targets.calories - upperBoundCals;
    const proteinRatio = protein / (targets.protein || 1);
    
    let nextGuidance = "";
    let insightText = "";
    const hour = new Date().getHours();

    // Guidance Logic
    if (remaining <= 0) {
      nextGuidance = "You've reached your target for today.";
    } else if (safeRemaining < 0) {
      nextGuidance = "Your logged meals have some uncertainty — your next meal might take you over your target.";
    } else if (safeRemaining < 200) {
      nextGuidance = "You're getting close to your limit when accounting for uncertainty.";
    } else if (remaining < 300) {
      nextGuidance = "The remaining room is quite small; your next meal might exceed your target.";
    } else {
      nextGuidance = `You have plenty of room today. ~${Math.round(remaining)} kcal remaining.`;
    }

    // Insight Logic
    if (remaining < 0) {
      insightText = "Target reached.";
    } else if (safeRemaining < 100) {
      insightText = "Entries are near your daily budget.";
    } else if (remaining < 300) {
      insightText = "Approaching your daily limit.";
    } else if (hour < 11) {
      insightText = "You have plenty of room today.";
    } else if (hour < 16) {
      insightText = "7-day trend is moving toward your goal.";
    } else {
      insightText = "Likely room for a light evening meal.";
    }

    res.json({ nextGuidance, insightText });
  });

  // --- Vite Middleware ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
