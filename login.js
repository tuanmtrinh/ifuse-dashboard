export async function login(context, loginFlag) {

  if (!loginFlag) {
    throw new Error("❌ No login profile specified (--ifuse)");
  }

  const profiles = {
    "g-blt": {
      baseUrl: "https://sfcweb2.gg.ftv",
      username: process.env.IFUSE_USERNAME,
      password: process.env.IFUSE_PASSWORD,
      location: "S010^B042",
      lang: "en-us"
    };

  const auth = profiles[loginFlag];

  if (!auth) {
    throw new Error(`❌ Unknown login profile: ${loginFlag}`);
  }

  // 🔴 Fail fast if secrets missing
  for (const key of ["baseUrl", "username", "password", "location"]) {
    if (!auth[key]) {
      throw new Error(`❌ Missing env for ${loginFlag}: ${key}`);
    }
  }

  console.log(`🔐 Using auth profile: ${loginFlag} (${auth.username})`);

  const page = await context.newPage();

  console.log("Initializing ASP.NET session...");
  await page.goto(auth.baseUrl, { waitUntil: "domcontentloaded" });

  console.log("Logging in via LoginHandler.aspx...");

  const response = await page.request.post(
    `${auth.baseUrl}/Handler/LoginHandler.aspx`,
    {
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      data: {
        u: auth.username,
        p: auth.password,
        lang: auth.lang,
        loc: auth.location
      }
    }
  );

  const text = await response.text();

  console.log("Login status:", response.status());

  if (!response.ok()) {
    throw new Error("❌ Login request failed.");
  }

  if (!text || text.toLowerCase().includes("error")) {
    throw new Error("❌ Login rejected by server.");
  }

  console.log("✅ Login successful. Session established.");

  await page.close();
}
