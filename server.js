// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const STORAGE_FILE = process.env.STORAGE_STATE_PATH || path.resolve(__dirname, "state.json");

// Globals
let browser = null;
let context = null;
let page = null;

async function startBrowser() {
  if (browser) return;

  console.log("Launching Chromium...");
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-software-rasterizer"
    ]
    // don't use slowMo in production servers
  });

  await createContextAndPage();
}

async function createContextAndPage() {
  // Close any previous context/page
  try { if (page && !page.isClosed()) await page.close(); } catch {}
  try { if (context && !context.isClosed()) await context.close(); } catch {}

  const storageExists = fs.existsSync(STORAGE_FILE);
  context = await browser.newContext(storageExists ? { storageState: STORAGE_FILE } : {});
  page = await context.newPage();
}

async function ensureBrowser() {
  try {
    if (!browser) {
      await startBrowser();
      return;
    }
    if (!context || context.isClosed()) {
      console.log("Context closed; creating a new one...");
      await createContextAndPage();
      return;
    }
    if (!page || page.isClosed()) {
      console.log("Page closed; creating new page...");
      page = await context.newPage();
    }
  } catch (err) {
    console.error("ensureBrowser error:", err);
    // attempt a fresh start
    try {
      if (browser) {
        try { await browser.close(); } catch {}
      }
    } catch {}
    browser = null;
    await startBrowser();
  }
}

/* ---------- Utilities ---------- */

async function findEmailField(page) {
  const selectors = [
    "#login_id",
    'input[name="LOGIN_ID"]',
    'input[placeholder="Email Address"]',
    'input[type="text"]'
  ];

  for (const sel of selectors) {
    const el = page.locator(sel);
    if (await el.count() > 0) return el.first();
  }

  for (const frame of page.frames()) {
    for (const sel of selectors) {
      const el = frame.locator(sel);
      if (await el.count() > 0) return el.first();
    }
  }

  throw new Error("Email field not found");
}

async function findPasswordField(page) {
  const selectors = [
    "#password",
    'input[name="PASSWORD"]',
    'input[type="password"]'
  ];

  for (const sel of selectors) {
    const el = page.locator(sel);
    if (await el.count() > 0) return el.first();
  }

  for (const frame of page.frames()) {
    for (const sel of selectors) {
      const el = frame.locator(sel);
      if (await el.count() > 0) return el.first();
    }
  }

  throw new Error("Password field not found");
}

async function findNextButton(page) {
  const selectors = [
    "#nextbtn",
    'button[type="submit"]',
    'button:has-text("Next")',
    'button:has-text("Sign in")',
    'input[type="submit"]'
  ];

  for (const sel of selectors) {
    const el = page.locator(sel);
    if (await el.count() > 0) return el.first();
  }

  for (const frame of page.frames()) {
    for (const sel of selectors) {
      const el = frame.locator(sel);
      if (await el.count() > 0) return el.first();
    }
  }

  throw new Error("Next button not found");
}

/* ---------- Site-specific helpers (kept from your original logic) ---------- */

async function isLoggedIn() {
  try {
    if (!page) return false;
    await page.goto("https://academia.srmist.edu.in", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    const dashboard = await page.locator("text=My Attendance").count();
    return dashboard > 0;
  } catch (err) {
    console.log("isLoggedIn check failed:", err.message || err);
    return false;
  }
}

async function handleSessionLimit(page) {
  try {
    const terminateBtn = page.locator("#continue_button");
    if (await terminateBtn.count() > 0) {
      console.log("Maximum concurrent sessions reached, attempting to terminate old sessions...");
      await terminateBtn.click();
      await page.waitForTimeout(2000);
      const confirmPopup = page.locator(".confirm-delete_btn");
      if (await confirmPopup.count() > 0) {
        await confirmPopup.first().click();
        await page.waitForTimeout(2000);
      }
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
    }
  } catch (err) {
    console.log("Session limit handler error:", err);
  }
}

async function loadAttendance(page) {
  console.log("Trying to load attendance...");
  const attendanceLoaded = async () => {
    for (const frame of page.frames()) {
      const rows = await frame.locator("table tbody tr").count();
      if (rows > 0) return true;
    }
    return false;
  };

  try {
    if (!page.url().includes("academia.srmist.edu.in")) {
      await page.goto("https://academia.srmist.edu.in", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
    }

    // try multiple strategies (kept yours)
    await page.evaluate(() => { window.location.hash = "Page:My_Attendance"; });
    await page.waitForTimeout(4000);
    if (await attendanceLoaded()) return true;
  } catch {}

  try {
    const btn = page.locator("text=My Attendance").first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(3000);
      if (await attendanceLoaded()) return true;
    }
  } catch {}

  try {
    const btn = page.locator("text=My Attendance").first();
    if (await btn.count()) {
      await btn.hover();
      await page.waitForTimeout(1000);
      await btn.click();
      await page.waitForTimeout(3000);
      if (await attendanceLoaded()) return true;
    }
  } catch {}

  try {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll("*")].find(e => e.innerText && e.innerText.includes("My Attendance"));
      if (el) el.click();
    });
    await page.waitForTimeout(3000);
    if (await attendanceLoaded()) return true;
  } catch {}

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const btn = page.locator("text=My Attendance").first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(3000);
      if (await attendanceLoaded()) return true;
    }
  } catch {}

  return false;
}

/* ---------- Routes ---------- */

app.get("/", (req, res) => res.send("SRM Dashboard API is running"));

app.post("/login", async (req, res) => {
  await ensureBrowser();
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  try {
    const already = await isLoggedIn();
    if (already) return res.json({ status: "already_logged_in" });

    await page.goto("https://academia.srmist.edu.in", { waitUntil: "networkidle", timeout: 30000 });

    const emailField = await findEmailField(page);
    await emailField.fill(email);

    const nextBtn = await findNextButton(page);
    await emailField.press("Tab");
    await nextBtn.click();

    const passwordField = await findPasswordField(page);
    await passwordField.fill(password);
    await passwordField.press("Tab");
    await nextBtn.click();

    await page.waitForTimeout(3000);
    await handleSessionLimit(page);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // persist storage state so next run can reuse it
    try {
      await context.storageState({ path: STORAGE_FILE });
      console.log("Saved storageState to", STORAGE_FILE);
    } catch (err) {
      console.warn("Failed to save storageState:", err);
    }

    return res.json({ status: "login_success" });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ error: "Login failed", details: err.message });
  }
});

app.post("/logout", async (req, res) => {
  await ensureBrowser();

  try {
    if (!page) return res.json({ error: "No page available" });

    const profileMenu = page.locator("#zc-account-settings");
    if (await profileMenu.count() > 0) {
      await profileMenu.click();
      await page.waitForTimeout(1000);
    }

    const logoutBtn = page.locator("#portalLogout");
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await page.waitForTimeout(2000);
    }

    // clear saved state
    try {
      if (fs.existsSync(STORAGE_FILE)) fs.unlinkSync(STORAGE_FILE);
    } catch (e) {
      console.warn("Failed to delete storage file:", e);
    }

    // create fresh context without storage
    await createContextAndPage();

    return res.json({ status: "logged_out" });
  } catch (err) {
    console.error("LOGOUT ERROR:", err);
    return res.status(500).json({ error: "Logout failed", details: err.message });
  }
});

app.get("/status", async (req, res) => {
  await ensureBrowser();
  try {
    const logged = await isLoggedIn();
    return res.json({ logged_in: !!logged });
  } catch (err) {
    return res.json({ logged_in: false });
  }
});

app.get("/attendance", async (req, res) => {
  await ensureBrowser();
  try {
    if (!page) return res.json({ error: "Login first" });

    const loaded = await loadAttendance(page);
    if (!loaded) return res.status(500).json({ error: "Attendance page failed to load" });

    let attendanceFrame = null;
    for (const frame of page.frames()) {
      const rows = await frame.locator("table tbody tr").count();
      if (rows > 0) {
        attendanceFrame = frame;
        break;
      }
    }

    if (!attendanceFrame) return res.status(500).json({ error: "Attendance frame not found" });

    const courses = await attendanceFrame.evaluate(() => {
      const rows = document.querySelectorAll("table tbody tr");
      const data = [];
      rows.forEach(row => {
        const cols = row.querySelectorAll("td");
        if (cols.length < 9) return;
        const code = cols[0].innerText.trim();
        const title = cols[1].innerText.trim();
        const conducted = cols[6].innerText.trim();
        if (!code || !title) return;
        if (!/[A-Z]{2,}/.test(code)) return;
        data.push({
          code,
          title,
          faculty: cols[3].innerText.trim(),
          slot: cols[4].innerText.trim(),
          room: cols[5].innerText.trim(),
          conducted,
          absent: cols[7].innerText.trim(),
          attendance: cols[8].innerText.trim()
        });
      });
      return data;
    });

    return res.json({ courses });
  } catch (err) {
    console.error("ATTENDANCE ERROR:", err);
    return res.status(500).json({ error: "Attendance fetch failed", details: err.message });
  }
});

app.get("/marks", async (req, res) => {
  await ensureBrowser();
  try {
    if (!page) return res.json({ error: "Login first" });

    const loaded = await loadAttendance(page);
    if (!loaded) return res.status(500).json({ error: "Marks page failed to load" });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    let marksFrame = null;
    for (const frame of page.frames()) {
      const tables = await frame.locator("table").count();
      if (tables > 1) {
        marksFrame = frame;
        break;
      }
    }

    if (!marksFrame) return res.status(500).json({ error: "Marks frame not found" });

    const subjects = await marksFrame.evaluate(() => {
      const rows = document.querySelectorAll("table > tbody > tr");
      const results = [];
      rows.forEach((row, index) => {
        if (index === 0) return; // skip header
        const cols = row.querySelectorAll("td");
        if (cols.length < 3) return;
        const code = cols[0].innerText.trim();
        const type = cols[1].innerText.trim();
        const perfCell = cols[2];
        const subject = { code, title: code + " (" + type + ")", components: [], total: 0, max: 0 };
        const compCells = perfCell.querySelectorAll("td");
        compCells.forEach(cell => {
          const strong = cell.querySelector("strong");
          if (!strong) return;
          const header = strong.innerText.trim(); // FT-II/15.00
          const scoreText = cell.innerText.replace(header, "").trim();
          const parts = header.split("/");
          const name = parts[0];
          const max = parseFloat(parts[1]) || 0;
          const score = parseFloat(scoreText) || 0;
          subject.components.push({ name, score, max });
          subject.total += score;
          subject.max += max;
        });
        if (subject.components.length > 0) results.push(subject);
      });
      return results;
    });

    return res.json({ subjects });
  } catch (err) {
    console.error("MARKS ERROR:", err);
    return res.status(500).json({ error: "Marks fetch failed", details: err.message });
  }
});

/* ---------- Start server and browser ---------- */

const server = app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  try {
    await startBrowser();
  } catch (err) {
    console.error("Browser launch failed:", err);
  }
});

/* ---------- Graceful shutdown ---------- */

async function shutdown() {
  console.log("Shutting down...");
  try { if (server) server.close(); } catch {}
  try { if (page && !page.isClosed()) await page.close(); } catch {}
  try { if (context && !context.isClosed()) await context.close(); } catch {}
  try { if (browser) await browser.close(); } catch (err) { console.warn("Error closing browser", err); }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  shutdown();
});
