import re

file_path = "c:/Users/Dell/bananashop/banana-store/components/AdminPanel.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace class constants
replacements = {
    r"const cardClass = '[^']+';": "const cardClass = 'relative overflow-hidden bg-black/40 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all duration-500 hover:border-white/[0.15] hover:shadow-[0_8px_40px_rgba(250,204,21,0.06)] hover:-translate-y-0.5';",
    r"const fieldClass = '[^']+';": "const fieldClass = 'w-full rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3.5 text-sm text-white placeholder:text-white/20 backdrop-blur-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#facc15]/30 focus:border-[#facc15]/20 focus:bg-white/[0.03] hover:border-white/[0.12]';",
    r"const fieldCompactClass = '[^']+';": "const fieldCompactClass = 'rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/20 backdrop-blur-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#facc15]/30 focus:border-[#facc15]/20 focus:bg-white/[0.03] hover:border-white/[0.12]';",
    r"const primaryButtonClass = '[^']+';": "const primaryButtonClass = 'relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#facc15] to-[#eab308] px-6 py-3.5 font-bold text-black shadow-[0_0_20px_rgba(250,204,21,0.2)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(250,204,21,0.4)] active:scale-[0.98] before:absolute before:inset-0 before:bg-white/20 before:opacity-0 hover:before:opacity-100 before:transition-opacity';",
    r"const subtleButtonClass = '[^']+';": "const subtleButtonClass = 'rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-sm font-semibold text-white/80 backdrop-blur-xl transition-all duration-300 hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-white hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] active:scale-[0.98]';",
    r"const mutedPanelClass = '[^']+';": "const mutedPanelClass = 'rounded-3xl border border-white/[0.05] bg-black/30 backdrop-blur-2xl p-5';",
    r"const uploadButtonClass = '[^']+';": "const uploadButtonClass = 'flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl border border-dashed border-white/[0.15] bg-white/[0.02] px-4 text-sm font-semibold text-white/70 backdrop-blur-xl transition-all duration-300 hover:border-[#facc15]/40 hover:bg-[#facc15]/5 hover:text-[#facc15]';",
    r"const removeButtonClass = '[^']+';": "const removeButtonClass = 'flex h-12 w-full items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-semibold text-red-400 backdrop-blur-xl transition-all duration-300 hover:border-red-500/40 hover:bg-red-500/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40';",
}

for pattern, repl in replacements.items():
    content = re.sub(pattern, repl, content)

# Background overhaul
old_bg = """    <div className="relative flex min-h-screen min-h-\\[100svh\\] overflow-hidden bg-transparent text-white">
      <div className="pointer-events-none absolute inset-0 bg-\\[radial-gradient\\(circle_at_top_right,rgba\\(250,204,21,0\\.16\\),transparent_46%\\),radial-gradient\\(circle_at_bottom_left,rgba\\(250,204,21,0\\.08\\),transparent_38%\\)\\]" \\/>
      <div className="pointer-events-none absolute inset-0 opacity-35 \\[background-image:linear-gradient\\(rgba\\(250,204,21,0\\.08\\)_1px,transparent_1px\\),linear-gradient\\(90deg,rgba\\(250,204,21,0\\.08\\)_1px,transparent_1px\\)\\] \\[background-size:48px_48px\\]" \\/>"""

new_bg = """    <div className="relative flex min-h-screen min-h-[100svh] overflow-hidden bg-[#030303] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(250,204,21,0.12),rgba(255,255,255,0))] blur-3xl" />
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_70%,transparent_100%)] opacity-20" />"""

content = re.sub(old_bg, new_bg, content)

# Sidebar overhaul
old_sidebar = """      <aside className="relative z-10 sticky top-0 hidden h-screen w-\\[310px\\] bg-\\[#0a0a0a\\]/95 border-r border-\\[#facc15\\]/20 p-6 lg:flex flex-col backdrop-blur-md">
        <div className="mb-6 rounded-2xl border border-\\[#facc15\\]/20 bg-\\[#0e0e0e\\] p-4">
          <div className="text-2xl font-black leading-tight">
            <span>\\{BRAND_CONFIG\\.identity\\.shortName\\}</span> <span className="text-\\[#facc15\\]">Admin</span>
          </div>
          <div className="mt-1 text-\\[11px\\] text-yellow-200/60 uppercase tracking-\\[0\\.18em\\]">Control Center</div>
          <div className="mt-3 rounded-xl border border-\\[#facc15\\]/20 bg-black/40 p-2 text-\\[11px\\] text-yellow-100/70">
            Store health: \\{lowStockCount\\} low stock, \\{pendingOrders\\} pending orders, \\{openTickets\\} open tickets\\.
          </div>
        </div>
        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
          \\{NAV_GROUPS\\.map\\(\\(group\\) => \\(
            <div key=\\{group\\.id\\}>
              <p className="mb-2 px-3 text-\\[10px\\] font-black uppercase tracking-\\[0\\.2em\\] text-yellow-200/45">\\{group\\.label\\}</p>
              <div className="space-y-1\\.5">
                \\{navItems\\.filter\\(\\(item\\) => item\\.group === group\\.id\\)\\.map\\(\\(item\\) => \\(
                  <button
                    key=\\{item\\.id\\}
                    onClick=\\{[^\\]]+\\}
                    className=\\{`w-full text-left px-3\\.5 py-3 rounded-xl flex items-center gap-3 border transition-all \\$\\{tab === item\\.id
                        \\? 'bg-\\[#facc15\\]/18 border-\\[#facc15\\]/45 shadow-\\[0_0_22px_rgba\\(250,204,21,0\\.14\\)\\]'
                        : 'border-transparent hover:border-white/10 hover:bg-white/5'
                      \\}`\\}
                  >
                    \\{React\\.createElement\\(item\\.icon, \\{ className: 'w-4 h-4 mt-0\\.5 shrink-0' \\}\\)\\}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">\\{item\\.label\\}</span>
                        \\{\\(navBadges\\[item\\.id\\] \\|\\| 0\\) > 0 && \\(
                          <span className="rounded-full border border-\\[#facc15\\]/40 bg-\\[#facc15\\]/15 px-2 py-0\\.5 text-\\[10px\\] font-black text-\\[#facc15\\]">
                            \\{navBadges\\[item\\.id\\]\\}
                          </span>
                        \\)\\}
                      </div>
                      <div className="mt-0\\.5 truncate text-\\[11px\\] text-yellow-200/60">\\{item\\.description\\}</div>
                    </div>
                  </button>
                \\)\\)\\}
              </div>
            </div>
          \\)\\)\\}
        </div>
        <button onClick=\\{onLogout\\} className="mt-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 flex items-center gap-2">
          <LogOut className="w-4 h-4" /> Log Out
        </button>
      </aside>"""

new_sidebar = """      <aside className="relative z-20 hidden w-[320px] shrink-0 flex-col border-r border-white/[0.05] bg-black/20 backdrop-blur-2xl lg:flex h-screen sticky top-0">
        <div className="p-8 pb-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#facc15] to-[#eab308] text-xl font-black text-black shadow-[0_0_30px_rgba(250,204,21,0.3)]">
              {BRAND_INITIALS}
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-white">{BRAND_CONFIG.identity.shortName}</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#facc15]">Control Center</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 backdrop-blur-md">
             <div className="flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-bold uppercase text-orange-400">
               <span className="h-1.5 w-1.5 rounded-full bg-orange-400"></span>{lowStockCount} Low stock
             </div>
             <div className="flex items-center gap-1.5 rounded-full border border-[#facc15]/30 bg-[#facc15]/10 px-2 py-1 text-[10px] font-bold uppercase text-[#facc15]">
               <span className="h-1.5 w-1.5 rounded-full bg-[#facc15]"></span>{pendingOrders} Pending
             </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-6 py-2 custom-scrollbar space-y-8">
          {NAV_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="mb-3 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">{group.label}</p>
              <div className="space-y-1.5">
                {navItems.filter((item) => item.group === group.id).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    className={`group relative flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all duration-300 ${
                      tab === item.id
                        ? 'bg-gradient-to-r from-[#facc15]/20 to-transparent text-white'
                        : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    {tab === item.id && (
                       <div className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-[#facc15] shadow-[0_0_12px_rgba(250,204,21,0.8)]" />
                    )}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 ${
                      tab === item.id
                        ? 'border-[#facc15]/40 bg-[#facc15]/20 text-[#facc15] shadow-[0_0_20px_rgba(250,204,21,0.2)]'
                        : 'border-white/10 bg-white/5 group-hover:border-white/20 group-hover:bg-white/10'
                    }`}>
                      {React.createElement(item.icon, { className: 'w-5 h-5' })}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`font-bold transition-all ${tab === item.id ? 'text-white' : ''}`}>{item.label}</span>
                        {(navBadges[item.id] || 0) > 0 && (
                          <span className="rounded-full border border-[#facc15]/40 bg-[#facc15]/20 px-2 py-0.5 text-[10px] font-black text-[#facc15]">
                            {navBadges[item.id]}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] font-medium text-white/40 group-hover:text-white/60">{item.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="p-6">
          <button onClick={onLogout} className="group flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3.5 text-sm font-bold text-red-400 transition-all hover:bg-red-500/20 hover:text-red-300 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]">
            <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Terminate Session
          </button>
        </div>
      </aside>"""

content = re.sub(old_sidebar, new_sidebar, content)

# Header Overhaul
old_header = """          <header className="mb-5 rounded-2xl border border-\\[#facc15\\]/20 bg-\\[#0b0b0b\\]/85 px-5 py-5 sm:px-6 shadow-\\[0_14px_40px_rgba\\(0,0,0,0\\.45\\)\\]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="rounded-full border border-\\[#facc15\\]/30 bg-\\[#facc15\\]/10 px-3 py-1 text-\\[10px\\] font-black uppercase tracking-\\[0\\.2em\\] text-\\[#facc15\\]">
                Roblox Keys Admin
              </div>
              <div className="text-xs text-yellow-100/60">Live session</div>
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-3xl font-black">\\{currentNavItem\\.label\\}</h1>
                <p className="text-yellow-200/60 text-sm">\\{currentNavItem\\.description\\}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden rounded-xl border border-\\[#facc15\\]/20 bg-black/35 px-3 py-2 text-xs text-yellow-100/70 md:block">
                  Pending: <span className="font-bold text-white">\\{pendingOrders\\}</span>
                </div>
                <div className="hidden rounded-xl border border-\\[#facc15\\]/20 bg-black/35 px-3 py-2 text-xs text-yellow-100/70 md:block">
                  Low stock: <span className="font-bold text-white">\\{lowStockCount\\}</span>
                </div>
                <div className="hidden rounded-xl border border-\\[#facc15\\]/20 bg-black/35 px-3 py-2 text-xs text-yellow-100/70 md:block">
                  Tickets: <span className="font-bold text-white">\\{openTickets\\}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <select
                value=\\{tab\\}
                onChange=\\{\\(e\\) => setTab\\(e\\.target\\.value as Tab\\)\\}
                className=\\{`\\$\\{fieldCompactClass\\} min-w-\\[180px\\]`\\}
                title="Quick Navigation"
              >
                \\{navItems\\.map\\(\\(item\\) => \\(
                  <option key=\\{item\\.id\\} value=\\{item\\.id\\}>\\{item\\.label\\}</option>
                \\)\\)\\}
              </select>
              <div className="bg-\\[#0b0b0b\\] border border-\\[#facc15\\]/20 rounded-xl px-4 py-2 shadow-\\[0_0_20px_rgba\\(250,204,21,0\\.08\\)\\]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-\\[#facc15\\] rounded-lg flex items-center justify-center font-black">\\{BRAND_INITIALS\\}</div>
                  <div><div className="text-sm font-bold">Admin Session</div><div className="text-\\[11px\\] text-yellow-200/60">Live</div></div>
                </div>
              </div>
            </div>
          </header>"""

new_header = """          <header className="mb-8 flex flex-col gap-6 rounded-3xl border border-white/[0.08] bg-black/30 backdrop-blur-3xl px-6 py-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-5">
               <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[#facc15]/30 bg-gradient-to-br from-[#facc15]/20 to-transparent text-[#facc15] shadow-[0_0_30px_rgba(250,204,21,0.2)]">
                  {React.createElement(currentNavItem.icon, { className: 'w-8 h-8' })}
               </div>
               <div>
                  <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{currentNavItem.label}</h1>
                  <p className="mt-1 text-sm font-medium text-white/50">{currentNavItem.description}</p>
               </div>
            </div>
            
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <select
                value={tab}
                onChange={(e) => setTab(e.target.value as Tab)}
                className={`${fieldCompactClass} hidden sm:block lg:hidden min-w-[200px] h-12`}
                title="Quick Navigation"
              >
                {navItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-2 pr-6 backdrop-blur-md">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#facc15] to-[#eab308] text-lg font-black text-black shadow-[0_0_20px_rgba(250,204,21,0.3)]">
                  {BRAND_INITIALS}
                </div>
                <div>
                  <div className="text-sm font-bold tracking-wide text-white">Administrator</div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#facc15]">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#facc15] opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#facc15]"></span>
                    </span>
                    Live Session
                  </div>
                </div>
              </div>
            </div>
          </header>"""

content = re.sub(old_header, new_header, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
