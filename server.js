const express = require("express");
const { chromium } = require("playwright");

const app = express();

app.use(express.json());
app.use(express.static("public"));

let context;
let page;


/*
START PERSISTENT BROWSER
*/

async function startBrowser() {

  context = await chromium.launchPersistentContext("./user-data", {
    headless: true,
    slowMo: 80,
    args: [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-software-rasterizer",
  "--single-process"
]
  });

  const pages = context.pages();

  page = pages.length ? pages[0] : await context.newPage();

}

async function ensureBrowser() {

  try {

    if (!context || context.isClosed()) {
      console.log("Browser closed. Restarting...");
      await startBrowser();
      return;
    }

    if (!page || page.isClosed()) {
      console.log("Page closed. Creating new page...");
      page = await context.newPage();
    }

  } catch (err) {

    console.log("Browser recovery triggered");
    await startBrowser();

  }

}


/*
CHECK IF ALREADY LOGGED IN
*/

async function isLoggedIn() {

  try {

    await page.goto("https://academia.srmist.edu.in", {
      waitUntil: "domcontentloaded"
    });

    await page.waitForTimeout(3000);

    const dashboard = await page.locator("text=My Attendance").count();

    return dashboard > 0;

  } catch {

    return false;

  }

}


/*
HANDLE MAX SESSION LIMIT SCREEN
*/

async function handleSessionLimit(page) {

  try {

    console.log("Checking for session limit screen...");

    const terminateBtn = page.locator("#continue_button");

    if (await terminateBtn.count() > 0) {

      console.log("Maximum concurrent sessions reached");

      await terminateBtn.click();

      await page.waitForTimeout(2000);

      const confirmPopup = page.locator(".confirm-delete_btn");

      if (await confirmPopup.count() > 0) {

        console.log("Confirmation popup detected");

        await confirmPopup.first().click();

        await page.waitForTimeout(2000);

        console.log("Session termination confirmed");

      } else {

        console.log("No confirmation popup");

      }

      await page.waitForLoadState("networkidle");

      await page.waitForTimeout(4000);

      console.log("Old sessions terminated successfully");

    }

  } catch (err) {

    console.log("Session limit handler error:", err);

  }

}


/*
UTILITY: FIND LOGIN FIELD
*/

async function findEmailField(page) {

  const selectors = [
    "#login_id",
    'input[name="LOGIN_ID"]',
    'input[placeholder="Email Address"]',
    'input[type="text"]'
  ];

  for (const sel of selectors) {
    const el = page.locator(sel);
    if (await el.count() > 0) return el;
  }

  const frames = page.frames();

  for (const frame of frames) {
    for (const sel of selectors) {
      const el = frame.locator(sel);
      if (await el.count() > 0) return el;
    }
  }
  if (!attendanceFrame) {
  return res.json({
    error: "Attendance frame not found"
  });
}

  throw new Error("Email field not found");
}


/*
UTILITY: FIND PASSWORD FIELD
*/

async function findPasswordField(page) {

  const selectors = [
    "#password",
    'input[name="PASSWORD"]',
    'input[type="password"]'
  ];

  for (const sel of selectors) {
    const el = page.locator(sel);
    if (await el.count() > 0) return el;
  }

  const frames = page.frames();

  for (const frame of frames) {
    for (const sel of selectors) {
      const el = frame.locator(sel);
      if (await el.count() > 0) return el;
    }
  }

  throw new Error("Password field not found");
}


/*
UTILITY: FIND NEXT BUTTON
*/

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

  const frames = page.frames();

  for (const frame of frames) {
    for (const sel of selectors) {
      const el = frame.locator(sel);
      if (await el.count() > 0) return el.first();
    }
  }

  throw new Error("Next button not found");
}


/*
ATTENDANCE MULTI FALLBACK LOADER
*/

async function loadAttendance(page) {

  console.log("Trying to load attendance...");

  const attendanceLoaded = async () => {

    const frames = page.frames();

    for (const frame of frames) {

      const rows = await frame.locator("table tbody tr").count();

      if (rows > 0) return true;

    }

    return false;
  };


  try {

    console.log("Method 0: Navigate to attendance page");

    if (!page.url().includes("academia.srmist.edu.in")) {

      await page.goto("https://academia.srmist.edu.in", {
        waitUntil: "domcontentloaded"
      });

      await page.waitForTimeout(4000);
    }

    await page.evaluate(() => {
      window.location.hash = "Page:My_Attendance";
    });

    await page.waitForTimeout(5000);

    if (await attendanceLoaded()) return true;

  } catch {}


  try {

    console.log("Method 1: Normal click");

    const btn = page.locator("text=My Attendance").first();

    if (await btn.count()) {

      await btn.click();
      await page.waitForTimeout(4000);

      if (await attendanceLoaded()) return true;

    }

  } catch {}


  try {

    console.log("Method 2: Hover then click");

    const btn = page.locator("text=My Attendance").first();

    if (await btn.count()) {

      await btn.hover();

      await page.waitForTimeout(2000);

      await btn.click();

      await page.waitForTimeout(4000);

      if (await attendanceLoaded()) return true;

    }

  } catch {}


  try {

    console.log("Method 3: JS click");

    await page.evaluate(() => {

      const el = [...document.querySelectorAll("*")]
        .find(e => e.innerText && e.innerText.includes("My Attendance"));

      if (el) el.click();

    });

    await page.waitForTimeout(4000);

    if (await attendanceLoaded()) return true;

  } catch {}


  try {

    console.log("Method 4: UI refresh");

    await page.evaluate(() => {

      window.dispatchEvent(new Event("resize"));
      document.body.click();

    });

    await page.waitForTimeout(3000);

    if (await attendanceLoaded()) return true;

  } catch {}


  try {

    console.log("Method 5: Reload");

    await page.reload({ waitUntil: "domcontentloaded" });

    await page.waitForTimeout(5000);

    const btn = page.locator("text=My Attendance").first();

    if (await btn.count()) {

      await btn.hover();
      await btn.click();

      await page.waitForTimeout(4000);

      if (await attendanceLoaded()) return true;

    }

  } catch {}

  return false;
}


/*
LOGIN ROUTE
*/

app.post("/login", async (req, res) => {

  await ensureBrowser();

  const { email, password } = req.body;

  try {

    const logged = await isLoggedIn();

    if (logged) {

      return res.json({
        status: "already_logged_in"
      });

    }

    console.log("Opening SRM portal...");

    await page.goto("https://academia.srmist.edu.in", {
      waitUntil: "networkidle"
    });

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
    await page.waitForTimeout(5000);

    res.json({
      status: "login_success"
    });

  } catch (err) {

    console.log("LOGIN ERROR:", err);

    res.status(500).json({
      error: "Login failed"
    });

  }

});


/*
LOGOUT ROUTE
*/

app.post("/logout", async (req, res) => {

  await ensureBrowser();

  try {

    console.log("Logging out from SRM...");

    const profileMenu = page.locator("#zc-account-settings");

    if (await profileMenu.count() > 0) {
      await profileMenu.click();
      await page.waitForTimeout(1000);
    }

    const logoutBtn = page.locator("#portalLogout");

    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await page.waitForTimeout(3000);
    }

    res.json({
      status: "logged_out"
    });

  } catch (err) {

    console.log("LOGOUT ERROR:", err);

    res.json({
      error: "Logout failed"
    });

  }

});

/*
LOGIN STATUS CHECK
*/

app.get("/status", async (req, res) => {

  await ensureBrowser();

  try {

    const logged = await isLoggedIn();

    if (logged) {

      res.json({
        logged_in: true
      });

    } else {

      res.json({
        logged_in: false
      });

    }

  } catch {

    res.json({
      logged_in: false
    });

  }

});

/*
ATTENDANCE ROUTE
*/

app.get("/attendance", async (req, res) => {

  await ensureBrowser();


  try {

    if (!page) {
      return res.json({ error: "Login first" });
    }

    console.log("Opening dashboard...");

    const loaded = await loadAttendance(page);

    if (!loaded) {

      return res.json({
        error: "Attendance page failed to load"
      });

    }

    const frames = page.frames();

    let attendanceFrame = null;

    for (const frame of frames) {

      const rows = await frame.locator("table tbody tr").count();

      if (rows > 0) {
        attendanceFrame = frame;
        break;
      }

    }

    const courses = await attendanceFrame.evaluate(() => {

      const rows = document.querySelectorAll("table tbody tr");

      const data = [];

      rows.forEach(row => {

      const cols = row.querySelectorAll("td");

      if (cols.length < 9) return;

      const code = cols[0].innerText.trim();
      const title = cols[1].innerText.trim();
      const conducted = cols[6].innerText.trim();

      // Ignore empty rows or non-course rows
      if (!code || !title) return;

      // SRM course codes usually contain letters and numbers
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

    console.log("Courses found:", courses.length);

    res.json({ courses });

  } catch (err) {

    console.log("ATTENDANCE ERROR:", err);

    res.json({
      error: "Attendance fetch failed"
    });

  }

});

/*
MARKS ROUTE
*/

app.get("/marks", async (req, res) => {

  await ensureBrowser();

  try {

    if (!page) {
      return res.json({ error: "Login first" });
    }

    console.log("Opening marks section...");

    const loaded = await loadAttendance(page);

    if (!loaded) {

      return res.json({
        error: "Marks page failed to load"
      });

    }

    // Scroll down because marks table is below attendance
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    await page.waitForTimeout(3000);

    const frames = page.frames();

    let marksFrame = null;

    for (const frame of frames) {

      const tables = await frame.locator("table").count();

      if (tables > 1) {
        marksFrame = frame;
        break;
      }

    }

    const subjects = await marksFrame.evaluate(() => {

    const rows = document.querySelectorAll("table > tbody > tr");
    const results = [];

    rows.forEach((row, index) => {

      // skip header
      if (index === 0) return;

      const cols = row.querySelectorAll("td");
      if (cols.length < 3) return;

      const code = cols[0].innerText.trim();
      const type = cols[1].innerText.trim();
      const perfCell = cols[2];

      const subject = {
        code: code,
        title: code + " (" + type + ")",
        components: [],
        total: 0,
        max: 0
      };

      // inner table with marks
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

        subject.components.push({
          name,
          score,
          max
        });

        subject.total += score;
        subject.max += max;

      });

      // ignore subjects without marks
      if (subject.components.length > 0) {
        results.push(subject);
      }

    });

  return results;

});


    res.json({
      subjects
    });
  } catch (err) {

    console.log("MARKS ERROR:", err);

    res.json({
      error: "Marks fetch failed"
    });

  }

});

/*
SERVER START
*/

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {

  console.log("Server running on port", PORT);

  try {
    await startBrowser();
  } catch (err) {
    console.log("Browser launch failed:", err);
  }

});
