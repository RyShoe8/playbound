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

local lastSnapshot = nil

local function listOf(value)
  local out = {}
  if type(value) == "table" then
    for _, v in pairs(value) do
      if type(v) == "string" then table.insert(out, v) end
    end
  end
  return out
end

-- Online players with each one's allies and outstanding ally invites, for
-- the PlayBound overlay's player list. Written only when something changed.
local function writeOnlineSnapshot()
  local online = {}
  for pid, player in pairs(Players) do
    if player ~= nil and player.accountName and player.loggedIn then
      table.insert(online, {
        accountName = player.accountName,
        pid = pid,
        staffRank = tonumber(player.data and player.data.settings and player.data.settings.staffRank) or 0,
        allies = listOf(player.data and player.data.alliedPlayers),
        invitesSent = listOf(player.allyInvitesSent),
      })
    end
  end
  local startupRun = WorldInstance ~= nil and WorldInstance.coreVariables ~= nil
    and WorldInstance.coreVariables.hasRunStartupScripts == true
  local doc = { players = online, startupRun = startupRun }
  local key = nil
  local ok, encoded = pcall(function() return tableHelper.getPrintableTable(doc) end)
  if ok then key = encoded end
  if key ~= nil and key == lastSnapshot then return end
  lastSnapshot = key
  doc.updatedAt = os.time()
  saveJson("playbound-online.json", doc)
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

local function findAdminByAccount(accountName)
  local player = findPlayerByAccount(accountName)
  if player == nil or not player.loggedIn then return nil, "admin-offline" end
  local rank = tonumber(player.data and player.data.settings and player.data.settings.staffRank) or 0
  if rank < ADMIN_RANK then return nil, "not-admin" end
  for pid, p in pairs(Players) do
    if p == player then return pid end
  end
  return nil, "admin-offline"
end

-- Overlay buttons: the agent appends {id, command, targetPid, actor} to
-- playbound-commands.json; each runs once, as the admin account `actor`,
-- through TES3MP's own chat-command implementation.
local function processCommands()
  local queue = loadJson("playbound-commands.json")
  if type(queue) ~= "table" or type(queue.requests) ~= "table" then return end
  local results = loadJson("playbound-command-results.json")
  if type(results) ~= "table" or type(results.done) ~= "table" then results = { done = {} } end

  local changed = false
  local live = {}
  for _, req in ipairs(queue.requests) do
    if type(req) == "table" and type(req.id) == "string" then
      live[req.id] = true
      if results.done[req.id] == nil then
        changed = true
        local actorPid, reason = findAdminByAccount(req.actor)
        local outcome = "ok"
        if actorPid == nil then
          outcome = reason
        elseif req.command == "invite" then
          local target = tonumber(req.targetPid)
          if target == nil or Players[target] == nil or not Players[target].loggedIn then
            outcome = "target-offline"
          else
            defaultCommands.inviteAlly(actorPid, { "invite", tostring(target) })
          end
        elseif req.command == "runstartup" then
          defaultCommands.runStartup(actorPid, { "runstartup" })
        else
          outcome = "unknown-command"
        end
        results.done[req.id] = { outcome = outcome, at = os.time() }
      end
    end
  end
  -- Forget results for requests the agent has already trimmed from the queue.
  for id in pairs(results.done) do
    if not live[id] then results.done[id] = nil; changed = true end
  end
  if changed then saveJson("playbound-command-results.json", results) end
end

local function processPending()
  processClaim()
  processSetHour()
  pcall(processCommands)
end

-- Poll once a second so overlay requests apply immediately instead of on
-- the next login or cell change.
local pollTimerId = nil
function PlayboundPollTick()
  pcall(processPending)
  pcall(writeOnlineSnapshot)
  if pollTimerId ~= nil then tes3mp.RestartTimer(pollTimerId, 1000) end
end

customEventHooks.registerHandler("OnServerPostInit", function(eventStatus)
  local ok, id = pcall(function() return tes3mp.CreateTimerEx("PlayboundPollTick", 1000, "i", 0) end)
  if ok and id ~= nil then
    pollTimerId = id
    tes3mp.StartTimer(pollTimerId)
  end
end)

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
