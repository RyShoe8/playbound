-- PlayBound: TES3MP admin for party hosts.
-- 1) Allowlist (playbound-admins.json) — promote on authenticate.
-- 2) Claim file (playbound-admin-claim.json) — promote a named account while online
--    (written when the host clicks Claim admin in the PlayBound Ctrl+P panel).
-- 3) Online snapshot (playbound-online.json) — for the panel's account picker.

local ADMIN_RANK = 2

local function loadJson(name)
  local ok, data = pcall(function()
    return jsonInterface.load(name)
  end)
  if not ok or type(data) ~= "table" then
    return nil
  end
  return data
end

local function saveJson(name, data)
  pcall(function()
    jsonInterface.save(name, data)
  end)
end

local function loadAdmins()
  local data = loadJson("playbound-admins.json")
  if type(data) ~= "table" then
    return {}
  end
  if type(data.admins) == "table" then
    return data.admins
  end
  return data
end

local function saveAdmins(list)
  saveJson("playbound-admins.json", list)
end

local function normalize(name)
  return string.lower((tostring(name or ""):gsub("^%s+", ""):gsub("%s+$", "")))
end

local function isAllowlisted(name)
  local needle = normalize(name)
  if needle == "" then
    return false
  end
  for _, entry in ipairs(loadAdmins()) do
    if type(entry) == "string" and normalize(entry) == needle then
      return true
    end
  end
  return false
end

local function addAllowlist(name)
  local clean = tostring(name or ""):gsub("^%s+", ""):gsub("%s+$", "")
  if clean == "" then
    return
  end
  if isAllowlisted(clean) then
    return
  end
  local list = loadAdmins()
  table.insert(list, clean)
  saveAdmins(list)
end

local function writeOnlineSnapshot()
  local online = {}
  for pid, player in pairs(Players) do
    if player ~= nil and player.accountName and player.loggedIn then
      table.insert(online, {
        accountName = player.accountName,
        pid = pid,
        staffRank = tonumber(player.data and player.data.settings and player.data.settings.staffRank) or 0,
      })
    end
  end
  saveJson("playbound-online.json", { updatedAt = os.time(), players = online })
end

local function promotePlayer(player)
  if player == nil or player.data == nil then
    return false
  end
  player.data.settings = player.data.settings or {}
  local current = tonumber(player.data.settings.staffRank) or 0
  if current >= ADMIN_RANK then
    return true
  end
  player.data.settings.staffRank = ADMIN_RANK
  if player.SaveToDrive then
    player:SaveToDrive()
  end
  if player.Message and color and color.Green and color.Default then
    player:Message(color.Green .. "PlayBound: you are an admin on this party server.\n" .. color.Default)
  elseif player.Message then
    player:Message("PlayBound: you are an admin on this party server.\n")
  end
  if tes3mp and tes3mp.LogMessage and enumerations and enumerations.log then
    tes3mp.LogMessage(
      enumerations.log.INFO,
      "[PlayBound] Promoted " .. tostring(player.accountName) .. " to staffRank " .. tostring(ADMIN_RANK)
    )
  end
  return true
end

local function findPlayerByAccount(accountName)
  local needle = normalize(accountName)
  if needle == "" then
    return nil
  end
  for _, player in pairs(Players) do
    if player ~= nil and player.accountName and normalize(player.accountName) == needle then
      return player
    end
  end
  return nil
end

local function processClaim()
  local data = loadJson("playbound-admin-claim.json")
  if type(data) ~= "table" then
    return
  end
  if data.processed then
    return
  end
  local accountName = data.accountName
  if type(accountName) ~= "string" or normalize(accountName) == "" then
    return
  end

  addAllowlist(accountName)
  local player = findPlayerByAccount(accountName)
  if player ~= nil then
    promotePlayer(player)
  end

  saveJson("playbound-admin-claim.json", {
    processed = true,
    accountName = accountName,
    processedAt = os.time(),
    online = player ~= nil,
  })
  writeOnlineSnapshot()
end

local function syncTimeToPlayers()
  if WorldInstance == nil or WorldInstance.LoadTime == nil then
    return
  end
  for pid, player in pairs(Players) do
    if player ~= nil and player.loggedIn then
      pcall(function()
        WorldInstance:LoadTime(pid, true)
      end)
    end
  end
end

-- Same effect as the admin chat command /sethour [0-23].
local function setHourOfDay(hour)
  if WorldInstance == nil or WorldInstance.data == nil or WorldInstance.data.time == nil then
    return false, "no-world-time"
  end
  local h = math.floor(tonumber(hour) or -1)
  if h < 0 or h > 23 then
    return false, "invalid-hour"
  end

  WorldInstance.data.time.hour = h
  if WorldInstance.QuicksaveToDrive then
    WorldInstance:QuicksaveToDrive()
  end
  syncTimeToPlayers()

  local msg = "PlayBound: time of day set to hour " .. tostring(h) .. ".\n"
  for _, player in pairs(Players) do
    if player ~= nil and player.loggedIn and player.Message then
      if color and color.Green and color.Default then
        player:Message(color.Green .. msg .. color.Default)
      else
        player:Message(msg)
      end
    end
  end
  if tes3mp and tes3mp.LogMessage and enumerations and enumerations.log then
    tes3mp.LogMessage(enumerations.log.INFO, "[PlayBound] Set world hour to " .. tostring(h))
  end
  return true, h
end

local function processSetHour()
  local data = loadJson("playbound-sethour.json")
  if type(data) ~= "table" or data.processed then
    return
  end
  local ok, result = setHourOfDay(data.hour)
  saveJson("playbound-sethour.json", {
    processed = true,
    hour = data.hour,
    ok = ok,
    result = result,
    processedAt = os.time(),
  })
end

local function processPending()
  processClaim()
  processSetHour()
end

local function promoteIfAllowlisted(pid)
  local player = Players[pid]
  if player == nil then
    return
  end
  if isAllowlisted(player.accountName or player.name) then
    promotePlayer(player)
  end
end

customEventHooks.registerHandler("OnPlayerAuthentified", function(eventStatus, pid)
  processPending()
  promoteIfAllowlisted(pid)
  writeOnlineSnapshot()
end)

customEventHooks.registerHandler("OnPlayerDisconnect", function(eventStatus, pid)
  writeOnlineSnapshot()
end)

-- Request files are written by the PlayBound agent while players are online;
-- cell changes are a cheap chance to notice them without a custom timer API.
customEventHooks.registerHandler("OnPlayerCellChange", function(eventStatus, pid)
  processPending()
end)
