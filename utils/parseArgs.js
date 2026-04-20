export function parseArgs(argv) {

  const args = {};
  const flags = [];

  for (let i = 0; i < argv.length; i++) {

    const arg = argv[i];

    if (!arg.startsWith("--")) continue;

    const key = arg.replace(/^--/, "");
    const next = argv[i + 1];

    if (!next || next.startsWith("--")) {
      flags.push(key);
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }

  args._flags = flags;

  return args;

}
