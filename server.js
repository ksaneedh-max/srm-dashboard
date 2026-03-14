const express = require("express");
const { chromium } = require("playwright");

const app = express();

app.use(express.json());
app.use(express.static("public"));

let context;
let page;

/*
START BROWSER (RENDER SAFE)
*/
async function startBrowser() {

  console.log("Launching Playwright browser...");

  context = await chromium.launchPersistentContext("./user-data", {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding"
    ]
  });

  const pages = context.pages();
  page = pages.length ? pages[0] : await context.newPage();

  console.log("Browser launched successfully");
}


/*
ENSURE BROWSER RUNNING
*/
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
CHECK LOGIN STATUS
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
HANDLE SESSION LIMIT
*/
async function handleSessionLimit(page) {

  try {

    const terminateBtn = page.locator("#continue_button");

    if (await terminateBtn.count() > 0) {

      console.log("Maximum concurrent sessions reached");

      await terminateBtn.click();
      await page.waitForTimeout(2000);

      const confirmPopup = page.locator(".confirm-delete_btn");

      if (await confirmPopup.count() > 0) {

        await confirmPopup.first().click();
        await page.waitForTimeout(2000);

      }

      await page.waitForLoadState("networkidle");

    }

  } catch (err) {

    console.log("Session limit handler error:", err);

  }

}


/*
FIND ELEMENT HELPERS
*/
async function findElement(page, selectors) {

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

  return null;

}


/*
LOAD ATTENDANCE PAGE
*/
async function loadAttendance(page) {

  console.log("Loading attendance...");

  try {

    await page.goto("https://academia.srmist.edu.in", {
      waitUntil: "domcontentloaded"
    });

    await page.waitForTimeout(4000);

    await page.evaluate(() => {
      window.location.hash = "Page:My_Attendance";
    });

    await page.waitForTimeout(5000);

    return true;

  } catch {

    return false;

  }

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

    const emailField = await findElement(page, [
      "#login_id",
      'input[name="LOGIN_ID"]',
      'input[type="text"]'
    ]);

    if (!emailField) {
      return res.json({ error: "Email field not found" });
    }

    await emailField.fill(email);

    const nextBtn = await findElement(page, [
      "#nextbtn",
      'button[type="submit"]',
      'input[type="submit"]'
    ]);

    if (!nextBtn) {
      return res.json({ error: "Next button not found" });
    }

    await nextBtn.click();

    const passwordField = await findElement(page, [
      "#password",
      'input[name="PASSWORD"]',
      'input[type="password"]'
    ]);

    if (!passwordField) {
      return res.json({ error: "Password field not found" });
    }

    await passwordField.fill(password);
    await nextBtn.click();

    await page.waitForTimeout(3000);

    await handleSessionLimit(page);

    await page.waitForLoadState("networkidle");

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

    const profileMenu = page.locator("#zc-account-settings");

    if (await profileMenu.count()) {

      await profileMenu.click();
      await page.waitForTimeout(1000);

    }

    const logoutBtn = page.locator("#portalLogout");

    if (await logoutBtn.count()) {

      await logoutBtn.click();
      await page.waitForTimeout(3000);

    }

    res.json({ status: "logged_out" });

  } catch (err) {

    res.json({ error: "Logout failed" });

  }

});


/*
LOGIN STATUS
*/
app.get("/status", async (req, res) => {

  await ensureBrowser();

  try {

    const logged = await isLoggedIn();

    res.json({
      logged_in: logged
    });

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

    const loaded = await loadAttendance(page);

    if (!loaded) {
      return res.json({ error: "Attendance page failed to load" });
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

    if (!attendanceFrame) {

      return res.json({ error: "Attendance frame not found" });

    }

    const courses = await attendanceFrame.evaluate(() => {

      const rows = document.querySelectorAll("table tbody tr");

      const data = [];

      rows.forEach(row => {

        const cols = row.querySelectorAll("td");

        if (cols.length < 9) return;

        const code = cols[0].innerText.trim();
        const title = cols[1].innerText.trim();

        if (!code || !title) return;

        data.push({
          code,
          title,
          faculty: cols[3].innerText.trim(),
          slot: cols[4].innerText.trim(),
          room: cols[5].innerText.trim(),
          conducted: cols[6].innerText.trim(),
          absent: cols[7].innerText.trim(),
          attendance: cols[8].innerText.trim()
        });

      });

      return data;

    });

    res.json({ courses });

  } catch (err) {

    console.log("ATTENDANCE ERROR:", err);

    res.json({
      error: "Attendance fetch failed"
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
