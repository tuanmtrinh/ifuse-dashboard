import { pushToSheet } from "./pushToSheet.js";

async function main() {
  const fakeData = [
    {
      time: new Date().toISOString(),
      config: "TEST",
      yield: 95.5,
      fail: 4.5,
    },
  ];

  await pushToSheet(fakeData);
  console.log("Done");
}

main();
