import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut } from 'lucide-react'

/** The signed-in person: an avatar button that opens a panel with the full email (it wraps, never cut) and sign-out. */
export default function ProfileMenu({ user, admin, onSignOut }: { user: string; admin: boolean; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  return (
    <div
      ref={box}
      className="sm:relative" // on a phone the panel is anchored to the header, so it spans the screen instead of running off the left edge
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false)
          button.current?.focus() // focus goes back to what opened the panel
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="profile-panel"
        aria-label={`บัญชีของคุณ ${user}`}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 items-center gap-1 rounded-full border border-line-strong bg-surface py-1 pl-1.5 pr-2.5 text-ink transition-colors hover:border-ink"
      >
        <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-amber text-sm font-semibold uppercase text-on-amber">{user.charAt(0)}</span>
        <ChevronDown aria-hidden size={16} className={`text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id="profile-panel" role="group" aria-label="บัญชี" className="absolute inset-x-5 top-full z-40 mt-1 flex flex-col gap-3 sm:inset-x-auto sm:right-0 sm:mt-2 sm:w-72 rounded-[10px] border border-line bg-surface p-4 shadow-[0_12px_32px_-12px_rgba(8,9,9,0.3)]">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">เข้าสู่ระบบในชื่อ</span>
            <span className="break-all font-medium leading-6 text-ink">{user}</span>
            {admin && <span className="w-fit rounded-full border border-amber-line bg-amber-soft px-2.5 py-0.5 text-xs font-medium text-amber-text">Admin</span>}
          </div>
          <button type="button" onClick={onSignOut} className="-mx-1 flex min-h-11 items-center gap-2 rounded-lg border-0 border-t border-line bg-transparent px-1 pt-1 text-left text-sm font-medium text-ink hover:text-danger">
            <LogOut aria-hidden size={16} /> ออกจากระบบ
          </button>
        </div>
      )}
    </div>
  )
}
