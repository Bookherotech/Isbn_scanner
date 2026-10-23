/** Small "Powered by Cresterix" credit for the dark sidebars (admin + staff desktop). */
export function SidebarCredit() {
  return (
    <div className="sidebar__credit" aria-label="Powered by Cresterix">
      <span className="sidebar__credit-label">Powered by</span>
      <img src="/cresterix-mark-white.png" alt="" width={18} height={11} />
      <span className="sidebar__credit-name">Cresterix</span>
    </div>
  )
}
