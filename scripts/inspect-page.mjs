import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});

const page = await browser.newPage({
  locale: "zh-CN",
  viewport: { width: 1440, height: 1000 },
});

const apiResponses = [];
page.on("response", async (response) => {
  const url = response.url();
  if (!/status|timeline|profile/i.test(url) || !url.includes("xueqiu.com")) {
    return;
  }

  try {
    const contentType = response.headers()["content-type"] ?? "";
    if (contentType.includes("json")) {
      apiResponses.push({
        url,
        status: response.status(),
        body: await response.text(),
      });
    }
  } catch {
    // Some browser responses are not replayable after navigation.
  }
});

await page.goto("https://xueqiu.com/u/1247347556", {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
await page.waitForTimeout(15_000);

console.log("TITLE", await page.title());
console.log("URL", page.url());
console.log("BODY", (await page.locator("body").innerText()).slice(0, 5000));
console.log(
  "LINKS",
  await page.locator("a").evaluateAll((links) =>
    links.slice(0, 80).map((link) => ({
      text: link.textContent?.trim().slice(0, 80),
      href: link.href,
      className: link.className,
    })),
  ),
);
console.log(
  "API",
  apiResponses.map(({ url, status, body }) => ({
    url,
    status,
    length: body.length,
    sample: body.slice(0, 1000),
  })),
);

await browser.close();
