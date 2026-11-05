import { MAX_LOOKBACK_DAYS, parseAdAccountIds } from "./config";

export type MetaSyncArgs = {
  help: boolean;
  dryRun: boolean;
  days: number | null;
  accounts: string[];
  /** `primary` or a name from META_EXTRA_CONNECTIONS. Null syncs every ready connection. */
  connection: string | null;
  error: string | null;
};

export function parseMetaSyncArgs(argv: string[]): MetaSyncArgs {
  const result: MetaSyncArgs = { help: false, dryRun: false, days: null, accounts: [], connection: null, error: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    const accountValue = valueOf(argv, index, arg, "--account");
    if (accountValue.matched) {
      index = accountValue.next;
      if (!accountValue.value) {
        result.error = "--account needs an ad account id";
        return result;
      }
      const ids = parseAdAccountIds(accountValue.value);
      if (!ids.length) {
        result.error = `--account is not an ad account id: ${accountValue.value}`;
        return result;
      }
      result.accounts.push(...ids);
      continue;
    }
    const connectionValue = valueOf(argv, index, arg, "--connection");
    if (connectionValue.matched) {
      index = connectionValue.next;
      const name = connectionValue.value.trim().toLowerCase();
      if (!name) {
        result.error = "--connection needs a name";
        return result;
      }
      if (!/^[a-z][a-z0-9_]{0,32}$/.test(name)) {
        result.error = "--connection must be a name like befound";
        return result;
      }
      result.connection = name;
      continue;
    }
    const daysValue = valueOf(argv, index, arg, "--days");
    if (daysValue.matched) {
      index = daysValue.next;
      const days = Number(daysValue.value);
      if (!Number.isFinite(days) || days < 1 || days > MAX_LOOKBACK_DAYS) {
        result.error = `--days must be from 1 to ${MAX_LOOKBACK_DAYS}`;
        return result;
      }
      result.days = Math.floor(days);
      continue;
    }
    result.error = `unknown argument ${arg}`;
    return result;
  }
  result.accounts = parseAdAccountIds(result.accounts.join(","));
  return result;
}

function valueOf(argv: string[], index: number, arg: string, flag: string) {
  if (arg === flag) return { matched: true, value: argv[index + 1] ?? "", next: index + 1 };
  if (arg.startsWith(`${flag}=`)) return { matched: true, value: arg.slice(flag.length + 1), next: index };
  return { matched: false, value: "", next: index };
}

export function metaSyncHelp() {
  return `Read-only Meta sync. Uses META_ACCESS_TOKEN, META_APP_ID, META_APP_SECRET, and DATABASE_URL.
Optional extra businesses are names in META_EXTRA_CONNECTIONS. Each name reads
META_<NAME>_ACCESS_TOKEN, META_<NAME>_APP_ID, META_<NAME>_APP_SECRET, and
META_<NAME>_AD_ACCOUNT_IDS. Tokens stay in the environment.
Does not publish ads or change spend.

Usage:
  npm run meta:sync -- [--connection name] [--account act_ID] [--days 30] [--dry-run]

--connection  primary, or a name from META_EXTRA_CONNECTIONS. Example: befound
--account     One account, or a comma-separated list. Repeat the flag to add more.
              Without --connection, each account uses the connection that lists it.
              With only one connection configured, an unlisted account still uses that connection.
--days        Trailing days to pull, inclusive (default 7, max ${MAX_LOOKBACK_DAYS}).
              More than 7 days uses an async insights job.
--dry-run     Call Meta and print row counts. Do not write the database.

Example:
  META_ACCESS_TOKEN=... META_APP_ID=1093413013101625 META_APP_SECRET=... \\
    DATABASE_URL=postgresql://... \\
    npm run meta:sync -- --account act_532471207924121 --days 30 --dry-run

  npm run meta:sync -- --connection befound --account act_2897217887308756 --dry-run
`;
}
