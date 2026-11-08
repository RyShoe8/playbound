function isDiskSpaceError(error) {
  const details = [error?.code, error?.message, error?.stderr, error?.stderrTail,
    error?.cause?.code, error?.cause?.message].filter(Boolean).join(" ");
  return /\bDISK_FULL\b|\bENOSPC\b|\bERROR_DISK_FULL\b|\bERROR_HANDLE_DISK_FULL\b|no space left on device|disk (?:is )?full|not enough (?:free )?(?:disk )?space|insufficient (?:free )?(?:disk )?space/i.test(details);
}

function diskSpaceMessage(error) {
  const message = String(error?.message || "");
  if (/requires.*GB.*available/i.test(message)) return message;
  return "The drive used for installation ran out of space. Free some space or choose a default install folder on another drive, then try installing again. Downloads and extraction also need temporary space.";
}

module.exports = { isDiskSpaceError, diskSpaceMessage };
