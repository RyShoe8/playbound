/**
 * Normalize messy OS/driver CPU & GPU names into canonical display + identity keys.
 */

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function identityKeyFromName(name: string): string {
  return collapse(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function normalizeCpuName(raw: string): {
  displayName: string;
  identityKey: string;
  manufacturer: string | null;
  model: string | null;
} {
  let s = collapse(String(raw || ""));
  if (!s) {
    return { displayName: "Unknown CPU", identityKey: "unknown-cpu", manufacturer: null, model: null };
  }

  s = s
    .replace(/\(r\)|\(tm\)|\(c\)/gi, "")
    .replace(/cpu\s*@\s*[\d.]+\s*ghz/gi, "")
    .replace(/@\s*[\d.]+\s*ghz/gi, "")
    .replace(/\bprocessor\b/gi, "")
    .replace(/,+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let manufacturer: string | null = null;
  if (/^intel/i.test(s)) manufacturer = "Intel";
  else if (/^amd/i.test(s)) manufacturer = "AMD";
  else if (/apple/i.test(s)) manufacturer = "Apple";
  else if (/qualcomm|snapdragon/i.test(s)) manufacturer = "Qualcomm";

  // "Intel(R) Core(TM) i5-10400" → "Intel Core i5-10400"
  s = s.replace(/^intel\s*/i, manufacturer === "Intel" ? "Intel " : "");
  s = s.replace(/^amd\s*/i, manufacturer === "AMD" ? "AMD " : "");
  s = collapse(s);

  const modelMatch =
    s.match(/\b((?:core\s+)?(?:ultra\s+)?[iI]\d[-\w]*|ryzen\s+\d+\s+[\w]+|m[1-4](?:\s+pro|\s+max)?)\b/i) ||
    s.match(/\b([\w-]+)$/);
  const model = modelMatch ? collapse(modelMatch[1]) : s;

  const displayName = s || "Unknown CPU";
  return {
    displayName,
    identityKey: identityKeyFromName(displayName),
    manufacturer,
    model,
  };
}

export function normalizeGpuName(raw: string): {
  displayName: string;
  identityKey: string;
  manufacturer: string | null;
  model: string | null;
  isIntegrated: boolean;
  isVirtual: boolean;
} {
  let s = collapse(String(raw || ""));
  if (!s) {
    return {
      displayName: "Unknown GPU",
      identityKey: "unknown-gpu",
      manufacturer: null,
      model: null,
      isIntegrated: false,
      isVirtual: false,
    };
  }

  const lower = s.toLowerCase();
  const isVirtual =
    /virtual|microsoft\s*basic|remote\s*display|citrix|vmware|parallels|hyper-v|qvrdp|orkest/i.test(
      lower
    );
  const isIntegrated =
    /intel\s*(uhd|hd|iris)|amd\s*radeon\s*graphics(?!\s*rx)|apple\s*m[1-4]/i.test(lower) &&
    !/rtx|gtx|rx\s*\d{3,4}/i.test(lower);

  s = s
    .replace(/\(r\)|\(tm\)|\(c\)/gi, "")
    .replace(/\bgraphics\b/gi, (m, offset, str) => {
      // Keep "Radeon Graphics" integrated naming tidy but drop trailing "Graphics Adapter"
      if (/adapter|controller/i.test(str.slice(offset))) return "";
      return m;
    })
    .replace(/\badapter\b|\bcontroller\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  let manufacturer: string | null = null;
  if (/nvidia|geforce|quadro|rtx|gtx/i.test(s)) manufacturer = "NVIDIA";
  else if (/amd|radeon|ati\b/i.test(s)) manufacturer = "AMD";
  else if (/intel/i.test(s)) manufacturer = "Intel";
  else if (/apple/i.test(s)) manufacturer = "Apple";

  // NVIDIA often reports "NVIDIA GeForce RTX 3060 Laptop GPU"
  s = s.replace(/^nvidia\s+/i, "NVIDIA ");
  s = s.replace(/\blaptop\s+gpu\b/gi, "");
  s = s.replace(/\bgpu\b/gi, "");
  s = collapse(s);

  // Prefer compact model token
  const modelMatch =
    s.match(/\b(rtx\s*\d{3,4}\s*(?:ti|super)?|gtx\s*\d{3,4}\s*(?:ti|super)?|rx\s*\d{3,4}\s*(?:xt)?|arc\s*a\d+|uhd\s*\d+|iris\s*xe)\b/i) ||
    null;
  const model = modelMatch ? collapse(modelMatch[1]) : s;

  let displayName = s;
  if (manufacturer === "NVIDIA" && !/^nvidia/i.test(displayName)) {
    displayName = `NVIDIA ${displayName}`;
  }
  displayName = collapse(displayName);

  return {
    displayName,
    identityKey: identityKeyFromName(displayName),
    manufacturer,
    model,
    isIntegrated,
    isVirtual,
  };
}
