/**
 * PlayBound's contact address.
 *
 * One place, so the visible contact links and the inbox that receives contact-form
 * submissions cannot drift apart. It is receive-only: nothing is sent *from* it, so
 * it is not the mailer's sender address. It is also a mailbox, not an identity:
 * who counts as an admin is decided elsewhere (`FOUNDER_ADMIN_EMAILS`), and
 * changing this does not change anyone's access.
 */
export const CONTACT_EMAIL = "theteam@playbound.club";
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;
