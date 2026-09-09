import { createInterface } from "node:readline";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import {
  hashPassword,
  validatePasswordStrength,
} from "../src/server/auth/password";

/**
 * Set a staff password from the server.
 *
 * The product deliberately has no self-serve password reset: an Owner resets
 * their staff, and the sign-in page says so. That leaves the Owner themselves
 * with nobody above them, so an owner who forgets their own password — or who
 * gets locked out — needs a way back in that does not involve re-seeding the
 * database and losing every reservation in it.
 *
 * The password is typed here, never passed as an argument: arguments end up in
 * shell history and in the process list.
 *
 *   npm run auth:set-password -- --agency atlas-cars --user owner
 */

process.loadEnvFile?.(".env");

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Read a line without echoing it back to the terminal. */
function prompt(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  if (hidden) {
    const output = rl as unknown as {
      output: NodeJS.WriteStream;
      _writeToOutput: (text: string) => void;
    };
    output._writeToOutput = (text: string) => {
      // Let the prompt itself through; swallow the keystrokes after it.
      if (text.includes(question)) output.output.write(question);
    };
  }

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      if (hidden) process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const slug = arg("agency");
  const username = arg("user");

  if (!slug || !username) {
    console.error(
      "Usage: npm run auth:set-password -- --agency <slug> --user <username>",
    );
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL (or DIRECT_URL) must be set.");
    process.exitCode = 1;
    return;
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const agency = await db.agency.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!agency) {
      console.error(`No agency with the slug "${slug}".`);
      process.exitCode = 1;
      return;
    }

    const user = await db.user.findUnique({
      where: { agencyId_username: { agencyId: agency.id, username } },
      select: { id: true, fullName: true, role: true, isActive: true },
    });
    if (!user) {
      console.error(`No user "${username}" at ${agency.name}.`);
      process.exitCode = 1;
      return;
    }

    console.log(`${agency.name} — ${user.fullName} (@${username}, ${user.role})`);
    if (!user.isActive) {
      console.log("Note: this account is disabled and cannot sign in yet.");
    }

    const password = await prompt("New password: ", true);
    const weak = validatePasswordStrength(password);
    if (weak) {
      console.error(weak);
      process.exitCode = 1;
      return;
    }

    if ((await prompt("Confirm password: ", true)) !== password) {
      console.error("The two passwords do not match. Nothing was changed.");
      process.exitCode = 1;
      return;
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Anything signed in with the old password is stale.
    const { count } = await db.session.deleteMany({ where: { userId: user.id } });

    console.log(
      `Password set. ${count} existing session${count === 1 ? "" : "s"} signed out.`,
    );
    console.log(`Sign in at /${slug}/login`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
