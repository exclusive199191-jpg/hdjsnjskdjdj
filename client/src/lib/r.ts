// Route obfuscation — paths are stored as XOR-encoded char-code arrays
// so they do not appear as readable strings in the compiled bundle.
const K = 0x5F;
const _d = (a: number[]) => a.map(c => String.fromCharCode(c ^ K)).join('');

export const R = {
  apiBots:                    _d([112,62,47,54,112,61,48,43,44]),
  apiBotsId:                  _d([112,62,47,54,112,61,48,43,44,112,101,54,59]),
  apiBotsIdRestart:           _d([112,62,47,54,112,61,48,43,44,112,101,54,59,112,45,58,44,43,62,45,43]),
  apiBotsIdStop:              _d([112,62,47,54,112,61,48,43,44,112,101,54,59,112,44,43,48,47]),
  apiAdminAnnouncements:      _d([112,62,47,54,112,62,59,50,54,49,112,62,49,49,48,42,49,60,58,50,58,49,43,44]),
  apiAdminAnnouncementsId:    _d([112,62,47,54,112,62,59,50,54,49,112,62,49,49,48,42,49,60,58,50,58,49,43,44,112,101,54,59]),
  apiAdminAuth:               _d([112,62,47,54,112,62,59,50,54,49,112,62,42,43,55]),
  apiAdminBots:               _d([112,62,47,54,112,62,59,50,54,49,112,61,48,43,44]),
  apiAdminBotsId:             _d([112,62,47,54,112,62,59,50,54,49,112,61,48,43,44,112,101,54,59]),
  apiAdminBotsIdRestart:      _d([112,62,47,54,112,62,59,50,54,49,112,61,48,43,44,112,101,54,59,112,45,58,44,43,62,45,43]),
  apiAdminBotsDisconnectAll:  _d([112,62,47,54,112,62,59,50,54,49,112,61,48,43,44,112,59,54,44,60,48,49,49,58,60,43,114,62,51,51]),
  apiAdminBotOverview:        "/api/admin/bots/:id/overview",
  apiAdminBotProfile:         "/api/admin/bots/:id/profile",
  apiAdminData:               _d([112,62,47,54,112,62,59,50,54,49,112,59,62,43,62]),
  apiAnnouncements:           _d([112,62,47,54,112,62,49,49,48,42,49,60,58,50,58,49,43,44]),
  apiAuthInit:                _d([112,62,47,54,112,62,42,43,55,112,54,49,54,43]),
  apiDiscordWidget:           _d([112,62,47,54,112,59,54,44,60,48,45,59,114,40,54,59,56,58,43]),
  apiStats:                   _d([112,62,47,54,112,44,43,62,43,44]),
  apiUptime:                  _d([112,62,47,54,112,42,47,43,54,50,58]),
  apiOsintIpCheck:            "/api/osint/ip-check",
  routeSupport:               "/support",
  routeAdmin:                 _d([112,62,59,50,54,49]),
  routeAccounts:              _d([112,62,60,60,48,42,49,43,44]),
  routeBot:                   _d([112,61,48,43,112,101,54,59]),
} as const;
