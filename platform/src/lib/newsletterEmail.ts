/**
 * Templated Playbound Club newsletter HTML for the weekly issue admin builder.
 * All copy/images/links come from NewsletterEmailDraft — no hard-coded game content.
 */

import { SITE_DISCORD_INVITE, SITE_URL } from "@/lib/site";

export type NewsletterMiniGame = {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
};

export type NewsletterEpicGame = {
  title: string;
  description: string;
  imageUrl: string;
  badge: string;
};

export type NewsletterEmailDraft = {
  featured: {
    badge: string;
    title: string;
    description: string;
    imageUrl: string;
    ctaUrl: string;
  };
  newSectionTitle: string;
  newGames: NewsletterMiniGame[];
  epic: {
    eyebrow: string;
    title: string;
    games: NewsletterEpicGame[];
  };
  footer: {
    communityLabel: string;
    blueskyUrl: string;
    redditUrl: string;
    discordUrl: string;
    facebookUrl: string;
    unsubscribeUrl: string;
    copyrightYear: number;
  };
};

export type CatalogGamePrefill = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  coverImage?: string;
  whyWePickedIt?: string;
};

function siteOrigin(siteUrl = SITE_URL): string {
  return siteUrl.replace(/\/$/, "");
}

export function absoluteMediaUrl(url: string, siteUrl = SITE_URL): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^(https?:|data:)/i.test(trimmed)) return trimmed;
  const origin = siteOrigin(siteUrl);
  return `${origin}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

export function gamePageUrl(slug: string, siteUrl = SITE_URL): string {
  return `${siteOrigin(siteUrl)}/games/${encodeURIComponent(slug)}`;
}

export function logoUrl(siteUrl = SITE_URL): string {
  return `${siteOrigin(siteUrl)}/brand/playbound-logo-120.png`;
}

export function emptyNewsletterDraft(opts?: {
  siteUrl?: string;
  year?: number;
}): NewsletterEmailDraft {
  const origin = siteOrigin(opts?.siteUrl ?? SITE_URL);
  return {
    featured: {
      badge: "FEATURED PICK",
      title: "",
      description: "",
      imageUrl: "",
      ctaUrl: origin,
    },
    newSectionTitle: "New on Playbound",
    newGames: [
      emptyMiniGame(origin),
      emptyMiniGame(origin),
    ],
    epic: {
      eyebrow: "EPIC STORE DEALS",
      title: "Free Games This Week",
      games: [emptyEpicGame(), emptyEpicGame()],
    },
    footer: {
      communityLabel: "JOIN OUR COMMUNITY",
      blueskyUrl: "https://bsky.app",
      redditUrl: "https://www.reddit.com",
      discordUrl: SITE_DISCORD_INVITE,
      facebookUrl: "https://www.facebook.com",
      unsubscribeUrl: `${origin}/#unsubscribe`,
      copyrightYear: opts?.year ?? new Date().getUTCFullYear(),
    },
  };
}

export function emptyMiniGame(siteUrl = SITE_URL): NewsletterMiniGame {
  return {
    title: "",
    description: "",
    imageUrl: "",
    url: siteOrigin(siteUrl),
  };
}

export function emptyEpicGame(): NewsletterEpicGame {
  return {
    title: "",
    description: "",
    imageUrl: "",
    badge: "FREE",
  };
}

/** Prefill featured (and optionally a new-game slot) from a catalog game. */
export function prefillFeaturedFromGame(
  draft: NewsletterEmailDraft,
  game: CatalogGamePrefill,
  siteUrl = SITE_URL
): NewsletterEmailDraft {
  const blurb =
    (game.whyWePickedIt && game.whyWePickedIt.trim()) ||
    (game.description && game.description.trim()) ||
    game.tagline;
  return {
    ...draft,
    featured: {
      ...draft.featured,
      title: game.title,
      description: blurb,
      imageUrl: absoluteMediaUrl(game.coverImage ?? "", siteUrl),
      ctaUrl: gamePageUrl(game.slug, siteUrl),
      badge: draft.featured.badge || "FEATURED PICK",
    },
  };
}

export function prefillMiniFromGame(
  game: CatalogGamePrefill,
  siteUrl = SITE_URL
): NewsletterMiniGame {
  return {
    title: game.title,
    description: game.tagline || game.description.slice(0, 160),
    imageUrl: absoluteMediaUrl(game.coverImage ?? "", siteUrl),
    url: gamePageUrl(game.slug, siteUrl),
  };
}

/** Merge a stored/partial draft onto defaults (safe for older docs / partial saves). */
export function normalizeNewsletterDraft(
  raw: unknown,
  opts?: { siteUrl?: string; year?: number }
): NewsletterEmailDraft {
  const base = emptyNewsletterDraft(opts);
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Partial<NewsletterEmailDraft>;

  const featured = { ...base.featured, ...(d.featured ?? {}) };
  const epicIn = d.epic && typeof d.epic === "object" ? d.epic : {};
  const footer = { ...base.footer, ...(d.footer ?? {}) };

  const newGames = Array.isArray(d.newGames)
    ? d.newGames.map((g) => ({ ...emptyMiniGame(opts?.siteUrl), ...(g ?? {}) }))
    : base.newGames;
  while (newGames.length < 2) newGames.push(emptyMiniGame(opts?.siteUrl));

  const epicGames = Array.isArray((epicIn as NewsletterEmailDraft["epic"]).games)
    ? (epicIn as NewsletterEmailDraft["epic"]).games.map((g) => ({
        ...emptyEpicGame(),
        ...(g ?? {}),
      }))
    : base.epic.games;
  while (epicGames.length < 1) epicGames.push(emptyEpicGame());

  return {
    featured,
    newSectionTitle:
      typeof d.newSectionTitle === "string" && d.newSectionTitle.trim()
        ? d.newSectionTitle
        : base.newSectionTitle,
    newGames,
    epic: {
      eyebrow:
        typeof (epicIn as NewsletterEmailDraft["epic"]).eyebrow === "string"
          ? (epicIn as NewsletterEmailDraft["epic"]).eyebrow
          : base.epic.eyebrow,
      title:
        typeof (epicIn as NewsletterEmailDraft["epic"]).title === "string"
          ? (epicIn as NewsletterEmailDraft["epic"]).title
          : base.epic.title,
      games: epicGames,
    },
    footer,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value: string): string {
  return escapeHtml(value);
}

function text(value: string): string {
  return escapeHtml(value);
}

function nl2br(value: string): string {
  return text(value).replace(/\r\n|\n|\r/g, "<br>");
}

function renderMiniPair(
  left: NewsletterMiniGame | undefined,
  right: NewsletterMiniGame | undefined,
  siteUrl: string
): string {
  const renderCell = (game: NewsletterMiniGame | undefined) => {
    if (!game || (!game.title && !game.imageUrl)) {
      return `<td width="48%" class="two-col-td" style="vertical-align: top;"></td>`;
    }
    const img = absoluteMediaUrl(game.imageUrl, siteUrl);
    const href = game.url.trim() || siteOrigin(siteUrl);
    return `
                <td width="48%" class="two-col-td" style="background-color: #161F32; border-radius: 12px; border: 1px solid #243049; padding: 16px; vertical-align: top;">
                  ${
                    img
                      ? `<img src="${attr(img)}" alt="${attr(game.title)}" style="width: 100%; border-radius: 8px; margin-bottom: 12px;">`
                      : ""
                  }
                  <h3 style="font-size: 15px; font-weight: 600; color: #FFFFFF; margin: 0 0 6px 0;">${text(game.title)}</h3>
                  <p style="font-size: 12px; color: #94A3B8; margin: 0 0 12px 0; line-height: 1.4;">${text(game.description)}</p>
                  <a href="${attr(href)}" class="btn-secondary" style="font-size: 12px; padding: 6px 12px;">View Game</a>
                </td>`;
  };

  return `
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                ${renderCell(left)}
                <td width="4%"></td>
                ${renderCell(right)}
              </tr>
            </table>`;
}

function renderEpicRow(game: NewsletterEpicGame, siteUrl: string, isLast: boolean): string {
  if (!game.title && !game.imageUrl) return "";
  const img = absoluteMediaUrl(game.imageUrl, siteUrl);
  const badge = game.badge.trim() || "FREE";
  return `
        <tr>
          <td style="${isLast ? "" : "padding-bottom: 12px;"}">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #161F32; border-radius: 8px; padding: 12px;">
              <tr>
                <td width="70" style="vertical-align: middle;">
                  ${
                    img
                      ? `<img src="${attr(img)}" alt="${attr(game.title)}" width="70" height="70" style="border-radius: 6px; width: 70px; height: 70px; object-fit: cover;">`
                      : `<div style="width:70px;height:70px;border-radius:6px;background:#1e293b;"></div>`
                  }
                </td>
                <td style="padding-left: 12px; vertical-align: middle;">
                  <h4 style="margin: 0; font-size: 14px; font-weight: 600; color: #FFFFFF;">${text(game.title)}</h4>
                  <p style="margin: 2px 0 0 0; font-size: 12px; color: #94A3B8;">${text(game.description)}</p>
                </td>
                <td align="right" style="vertical-align: middle; padding-left: 8px;">
                  <span style="color: #4ADE80; font-size: 12px; font-weight: 700; background-color: rgba(74, 222, 128, 0.1); padding: 4px 8px; border-radius: 4px;">${text(badge)}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

/** Render the full newsletter HTML from a draft. */
export function buildNewsletterHtml(
  draftInput: NewsletterEmailDraft,
  opts?: { siteUrl?: string; title?: string }
): string {
  const siteUrl = opts?.siteUrl ?? SITE_URL;
  const draft = normalizeNewsletterDraft(draftInput, { siteUrl });
  const pageTitle = opts?.title ?? "Playbound Club Newsletter";
  const logo = logoUrl(siteUrl);
  const featuredImg = absoluteMediaUrl(draft.featured.imageUrl, siteUrl);
  const featuredHref = draft.featured.ctaUrl.trim() || siteOrigin(siteUrl);

  const activeNew = draft.newGames.filter((g) => g.title.trim() || g.imageUrl.trim());
  const newRows: string[] = [];
  for (let i = 0; i < Math.max(activeNew.length, 2); i += 2) {
    if (!activeNew[i] && !activeNew[i + 1] && i > 0) break;
    newRows.push(renderMiniPair(activeNew[i], activeNew[i + 1], siteUrl));
  }
  if (newRows.length === 0) {
    newRows.push(renderMiniPair(undefined, undefined, siteUrl));
  }

  const epicGames = draft.epic.games.filter((g) => g.title.trim() || g.imageUrl.trim());
  const epicRows = epicGames
    .map((g, i) => renderEpicRow(g, siteUrl, i === epicGames.length - 1))
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${text(pageTitle)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0B0F19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F8FAFC; -webkit-font-smoothing: antialiased; }
    table { border-spacing: 0; border-collapse: collapse; }
    td { padding: 0; }
    img { border: 0; max-width: 100%; height: auto; display: block; }
    a { color: #8B5CF6; text-decoration: none; }
    .btn { background-color: #8B5CF6; color: #FFFFFF !important; font-weight: 600; padding: 12px 24px; border-radius: 8px; display: inline-block; text-decoration: none; text-align: center; }
    .btn-secondary { background-color: #1E293B; color: #F8FAFC !important; border: 1px solid #334155; font-weight: 600; padding: 10px 20px; border-radius: 8px; display: inline-block; text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 12px !important; }
      .two-col-td { display: block !important; width: 100% !important; box-sizing: border-box; margin-bottom: 12px; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0B0F19;">
  <center style="width: 100%; table-layout: fixed; background-color: #0B0F19; padding-bottom: 40px;">
    <div style="max-width: 600px; margin: 0 auto;" class="container">

      <!-- HEADER -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
        <tr>
          <td align="center">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align: middle; padding-right: 12px;">
                  <img src="${attr(logo)}" width="40" height="40" alt="Playbound Logo" style="border-radius: 10px;">
                </td>
                <td style="vertical-align: middle;">
                  <span style="font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #FFFFFF; font-family: sans-serif;">playbound<span style="color: #8B5CF6;">.club</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- FEATURED GAME -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #161F32; border-radius: 16px; border: 1px solid #243049; overflow: hidden; margin-bottom: 24px;">
        <tr>
          <td>
            ${
              featuredImg
                ? `<img src="${attr(featuredImg)}" alt="${attr(draft.featured.title || "Featured Game")}" style="width: 100%; max-height: 280px; object-fit: cover;">`
                : `<div style="width:100%;height:160px;background:#1e1b4b;"></div>`
            }
          </td>
        </tr>
        <tr>
          <td style="padding: 24px;">
            <span style="background-color: #8B5CF6; color: #FFFFFF; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; letter-spacing: 0.5px;">${text(draft.featured.badge || "FEATURED PICK")}</span>
            <h1 style="font-size: 24px; font-weight: 700; margin: 12px 0 8px 0; color: #FFFFFF;">${text(draft.featured.title || "Featured game")}</h1>
            <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin: 0 0 20px 0;">
              ${nl2br(draft.featured.description)}
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <a href="${attr(featuredHref)}" class="btn">Play Now on Playbound</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- NEW ON PLAYBOUND -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
        <tr>
          <td style="padding-bottom: 12px;">
            <h2 style="font-size: 18px; font-weight: 700; color: #FFFFFF; margin: 0; letter-spacing: -0.3px;">${text(draft.newSectionTitle)}</h2>
          </td>
        </tr>
        <tr>
          <td>
            ${newRows.join("\n            <div style=\"height:12px;\"></div>\n            ")}
          </td>
        </tr>
      </table>

      <!-- EPIC GAMES FREE THIS WEEK -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0F172A; border-radius: 16px; border: 1px solid #1E293B; padding: 20px; margin-bottom: 28px;">
        <tr>
          <td style="padding-bottom: 16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color: #38BDF8; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">${text(draft.epic.eyebrow)}</span>
                  <h2 style="font-size: 18px; font-weight: 700; color: #FFFFFF; margin: 4px 0 0 0;">${text(draft.epic.title)}</h2>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${epicRows || `<tr><td style="color:#64748B;font-size:13px;padding:8px 0;">Add free games in the builder.</td></tr>`}
      </table>

      <!-- FOOTER & SOCIALS -->
      <table width="100%" cellpadding="0" cellspacing="0" style="text-align: center; padding-top: 12px; border-top: 1px solid #1E293B;">
        <tr>
          <td style="padding-bottom: 16px;">
            <p style="font-size: 13px; font-weight: 600; color: #94A3B8; margin: 0 0 12px 0;">${text(draft.footer.communityLabel)}</p>
            <a href="${attr(draft.footer.blueskyUrl)}" style="color: #F8FAFC; text-decoration: none; font-weight: 600; font-size: 13px; margin: 0 10px;">Bluesky</a>
            <span style="color: #334155;">•</span>
            <a href="${attr(draft.footer.redditUrl)}" style="color: #F8FAFC; text-decoration: none; font-weight: 600; font-size: 13px; margin: 0 10px;">Reddit</a>
            <span style="color: #334155;">•</span>
            <a href="${attr(draft.footer.discordUrl)}" style="color: #F8FAFC; text-decoration: none; font-weight: 600; font-size: 13px; margin: 0 10px;">Discord</a>
            <span style="color: #334155;">•</span>
            <a href="${attr(draft.footer.facebookUrl)}" style="color: #F8FAFC; text-decoration: none; font-weight: 600; font-size: 13px; margin: 0 10px;">Facebook</a>
          </td>
        </tr>
        <tr>
          <td>
            <p style="font-size: 12px; color: #64748B; line-height: 1.5; margin: 0;">
              © ${text(String(draft.footer.copyrightYear))} playbound.club. All rights reserved.<br>
              You are receiving this because you subscribed to updates at playbound.club.<br>
              <a href="${attr(draft.footer.unsubscribeUrl)}" style="color: #64748B; text-decoration: underline;">Unsubscribe</a>
            </p>
          </td>
        </tr>
      </table>

    </div>
  </center>
</body>
</html>`;
}
