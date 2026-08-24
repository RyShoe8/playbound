/**
 * Which channel a launcher upload targets, decided explicitly.
 *
 * This used to be inferred from a file: `existsSync(admin.yml)` chose the
 * channel, so a build whose metadata was simply missing — an installer copied
 * out of a downloads folder on its own, say — resolved to *production*. It
 * would have overwritten the public installer and the auto-update feed with an
 * unsigned binary, and the guard against exactly that was itself gated on the
 * same inference, so it never would have fired. A safety check that a missing
 * file turns off is not a safety check.
 *
 * So: the channel is now stated, never guessed, and defaults to the harmless
 * one. The yml files still matter, but only as *evidence* about how the build
 * was made — which is what they can actually attest to.
 *
 * Pulled into lib/ so the decision is unit-testable. It was previously inline
 * in a script nothing could import.
 */

export type ReleaseChannel = "admin" | "prod";

export type ChannelDecision = {
  channel: ReleaseChannel;
  /** False when nothing on the command line asked for a channel. */
  explicit: boolean;
  /** Set when the upload must not proceed; the message is user-facing. */
  refuse?: string;
};

export type BuildEvidence = {
  /** electron-builder writes this only for an unsigned (admin-channel) build. */
  hasAdminYml: boolean;
  /** ...and this for a signed one. */
  hasProdYml: boolean;
  platform: "windows" | "macos" | "linux";
};

const PROD_FLAGS = ["--prod", "--production", "--promote-prod"];
const OVERRIDE = "--i-know-its-unsigned";

/**
 * Resolve the target channel from argv and what the build left behind.
 *
 * Windows is the only platform gated, and deliberately so: mac and linux
 * artifacts are not signed through this path, so shipping them to the public
 * alias is the normal way they release.
 */
export function resolveReleaseChannel(args: string[], evidence: BuildEvidence): ChannelDecision {
  const wantsProd = PROD_FLAGS.some((f) => args.includes(f));
  const wantsAdmin = args.includes("--admin");

  if (wantsProd && wantsAdmin) {
    return {
      channel: "admin",
      explicit: true,
      refuse: "Both --admin and --prod were given. Pick one.",
    };
  }

  // The safe default. Nothing reaches real users without someone saying so.
  if (!wantsProd) {
    return { channel: "admin", explicit: wantsAdmin };
  }

  if (evidence.platform !== "windows") {
    return { channel: "prod", explicit: true };
  }

  if (args.includes(OVERRIDE)) {
    return { channel: "prod", explicit: true };
  }

  /*
   * For Windows production the build must positively look signed: it produced
   * latest.yml and did not produce admin.yml. Absent metadata is refused rather
   * than assumed either way, which is the hole this replaces — the old code
   * read "no admin.yml" as "signed".
   */
  if (evidence.hasAdminYml) {
    return {
      channel: "prod",
      explicit: true,
      refuse:
        "Refusing to publish an UNSIGNED Windows build to the public channel.\n" +
        "  admin.yml is present, which electron-builder only writes for an unsigned build.\n" +
        "  Publishing it would hand every user a SmartScreen warning and push it to\n" +
        "  existing installs through latest.yml.\n\n" +
        "  Build signed instead:  cd launcher && npm run dist:prod\n" +
        `  Or, if you truly mean it, re-run with ${OVERRIDE}`,
    };
  }

  if (!evidence.hasProdYml) {
    return {
      channel: "prod",
      explicit: true,
      refuse:
        "Refusing to publish to the public channel without update metadata.\n" +
        "  Neither latest.yml nor admin.yml sits beside the installer, so there is\n" +
        "  nothing to show this build was signed, and auto-update would break for\n" +
        "  everyone already installed.\n\n" +
        "  Upload it to the admin channel instead (the default), or build with\n" +
        "  cd launcher && npm run dist:prod\n" +
        `  Or, if you truly mean it, re-run with ${OVERRIDE}`,
    };
  }

  return { channel: "prod", explicit: true };
}
