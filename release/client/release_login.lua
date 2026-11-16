-- Release login: one private Android account and one local endpoint.
local RELEASE_ENDPOINT = 'http://127.0.0.1:28080'
-- The stock login expects the server-list callback even on failure. If it never comes, give up after this
-- many seconds so the loading spinner goes away and the Start button can ask again.
local RELEASE_FETCH_TIMEOUT = 15
local RELEASE_STARTING = 'The local server is starting. Please try again in a moment.'
local function ReleaseLocalGateway(server)
    if type(server) ~= 'table' or server.ip ~= '127.0.0.1'
        or type(server.port) ~= 'table' or #server.port == 0 then return false end
    for _, port in ipairs(server.port) do
        if port ~= 31400 then return false end
    end
    return true
end
-- OS Internet availability does not describe connectivity to Android loopback.
-- Connect still performs the real socket attempt and reports its failure.
function tbClass:IsReleaseLocalGateway()
    return ReleaseLocalGateway(self.pSelected)
end

local function ReleaseAccount()
    local bridge = U3D.AndroidJavaClass('com.zirenmidori.gcg.release.ReleaseBridge')
    bridge:CallStatic('prepareAccount')
    local account = 'gcg-offline-player-v1'
    GameManager.gcgEmbeddedPlayerAccount = account
    return account
end

local function UpdateButton(self)
    self.pnlDev.gameObject:SetActive(true)
    self.btnMenu.gameObject:SetActive(true)
    self.btnMenu.onClick:RemoveAllListeners()
    self.btnMenu.onClick:AddListener(function()
        U3D.AndroidJavaClass('com.zirenmidori.gcg.release.ReleaseBridge'):CallStatic('requestUpdate')
    end)
    local label = self:GetComponent('Text', 'PnlBG/PnlDev/BtnMenu/Txt')
    label.text = 'Update'
    for _, name in ipairs({'btnNew', 'btnUse', 'btnLogout', 'btnTransfer', 'btnResource'}) do
        if self[name] then self[name].gameObject:SetActive(false) end
    end
    self.serverObj.gameObject:SetActive(false)
end

local ReleaseOriginalInit = tbClass.OnInit
function tbClass:OnInit(...)
    ReleaseAccount()
    ReleaseOriginalInit(self, ...)
    UpdateButton(self)
end
function tbClass:CheckAuthValid() UpdateButton(self) end
function tbClass:ShowAccountID()
    self:Find('PnlBG/TxtUID').gameObject:SetActive(false)
end
function tbClass:UseSDK() return false end
function tbClass:CheckSelectZone() return true end
function tbClass:CanChooseZone() return false end
function tbClass:OpenSelectZone() end
function tbClass:InputAccountPassword() end
function tbClass:CreateAccount() end
function tbClass:OnLogout() UpdateButton(self) end

function tbClass:OnButtonClickUseAccount()
    if bLoginWait or Game.LuaUtils.IsUpdating() then return end
    if not self.isApplyServerListSuccess or not self.pSelected then
        if not self._releaseFetching then self:ApplyServerList() end
        return
    end
    self:ClearAuthInfo()
    self.pid = nil
    self.bCreate = false
    ReleaseAccount()
    PlayerLogic:ReSetLocalData()
    self:Connect()
end
function tbClass.OnSecondLogin()
    bCheckUpdate = true
    PlayerLogic:ReSetLocalData()
end

local ReleaseOriginalClose = tbClass.OnClose
function tbClass:OnClose(...)
    self._releaseRequest = (self._releaseRequest or 0) + 1
    self._releaseFetching = false
    if ReleaseOriginalClose then return ReleaseOriginalClose(self, ...) end
end
function tbClass:ApplyServerList()
    self.serverObj.gameObject:SetActive(false)
    self.lServers, self.pSelected = {}, nil
    self.isApplyServerListSuccess = false
    self._releaseFetching = true
    self:ShowLoading()
    self._releaseRequest = (self._releaseRequest or 0) + 1
    local request = self._releaseRequest
    pcall(Game.Timer.Add, RELEASE_FETCH_TIMEOUT, function()
        if request ~= self._releaseRequest or not self._releaseFetching then return end
        self._releaseRequest = self._releaseRequest + 1
        self._releaseFetching = false
        if not UI.IsOpen('UI_Login') then return end
        self:HideLoading()
        Game.MessageBox.Simple(RELEASE_STARTING)
    end)
    Game.ServerList.ChangeBaseUrl(RELEASE_ENDPOINT, function(data)
        if request ~= self._releaseRequest then return end
        self._releaseFetching = false
        if not UI.IsOpen('UI_Login') then return end
        self:HideLoading()
        if data and #data > 0 then
            local ok, decoded = pcall(Json.Decode, data)
            local servers = ok and type(decoded) == 'table' and (decoded.serverlist or decoded)
            local valid = type(servers) == 'table' and #servers > 0
            if valid then
                for _, server in ipairs(servers) do
                    if not ReleaseLocalGateway(server) then valid = false; break end
                end
            end
            if valid then self:ApplyServerListSuccess(); self.nFailTimesApplyServerList = 0; return end
        end
        self.lServers, self.pSelected = {}, nil
        Game.MessageBox.Simple(RELEASE_STARTING)
    end, true)
end
