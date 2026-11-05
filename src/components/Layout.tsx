import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Blocks,
  CalendarClock,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Gauge,
  History,
  Landmark,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useEntities } from '../lib/data'
import type { Settings } from '../lib/models'
import { Button } from './ui'
export const navigation = [
  { path: '/', name: 'Genel Bakış', icon: Gauge },
  { path: '/income', name: 'Gelirler', icon: ArrowDownLeft },
  { path: '/expenses', name: 'Giderler', icon: ArrowUpRight },
  { path: '/applications', name: 'Uygulamalar', icon: Blocks },
  { path: '/obligations', name: 'Borçlar ve Alacaklar', icon: Landmark },
  { path: '/accounts', name: 'Hesaplar', icon: Wallet },
  { path: '/recurring', name: 'Tekrarlayan İşlemler', icon: CalendarClock },
  { path: '/cash-flow', name: 'Nakit Akışı', icon: Activity },
  { path: '/reports', name: 'Raporlar', icon: BarChart3 },
  { path: '/history', name: 'İşlem Geçmişi', icon: CreditCard },
  { path: '/activity', name: 'Kayıtlar', icon: History, adminOnly: true },
  { path: '/settings', name: 'Ayarlar', icon: Settings2 },
]
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        v<span>↗</span>
      </span>
      <span>
        velonance<span className="brand-dot">.</span>
      </span>
    </div>
  )
}
export function ThemeButton() {
  const [theme, setTheme] = useState(() => localStorage.getItem('velonance-theme') || 'system')
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme)
    apply()
    localStorage.setItem('velonance-theme', theme)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  return (
    <Button
      variant="ghost"
      aria-label={'Tema: ' + theme}
      title="Tema: sistem / açık / koyu"
      onClick={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
    >
      {theme === 'dark' ? (
        <Moon size={18} />
      ) : theme === 'light' ? (
        <Sun size={18} />
      ) : (
        <span className="system-theme">◐</span>
      )}
    </Button>
  )
}
export default function Layout() {
  const { user, authorization, logout } = useAuth(),
    [open, setOpen] = useState(false),
    location = useLocation(),
    settings = useEntities<Settings>('settings')
  const name = settings.data?.rows.find((s) => s.id === 'general')?.name || 'Velon Apps'
  useEffect(() => setOpen(false), [location.pathname])
  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">
        İçeriğe geç
      </a>
      {open && (
        <button
          aria-label="Menüyü kapat"
          className="sidebar-overlay"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={'sidebar ' + (open ? 'open' : '')}>
        <div className="sidebar-brand">
          <Brand />
          <button className="mobile-close" aria-label="Menüyü kapat" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="studio-switch">
          <div className="studio-avatar">va</div>
          <div>
            <strong>{name}</strong>
            <span>Stüdyo çalışma alanı</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-caption">ÇALIŞMA ALANI</span>
        <nav aria-label="Ana menü">
          {navigation
            .filter((n) => !n.adminOnly || authorization?.role === 'ADMIN')
            .map((n, i) => (
              <NavLink
                end={n.path === '/'}
                to={n.path}
                key={n.path}
                className={({ isActive }) =>
                  (isActive ? 'active ' : '') + (i === 6 ? 'nav-break' : '')
                }
              >
                <n.icon size={18} />
                <span>{n.name}</span>
                {n.path === '/' && <span className="nav-dot" />}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={18} />
            <span>
              Size özel. Güvenle saklanır.<small>Google ile doğrulanmış erişim</small>
            </span>
          </div>
          <a
            className="help-link"
            href="https://firebase.google.com/docs"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={17} /> Firebase yardım merkezi <ArrowUpRight size={14} />
          </a>
          <div className="profile">
            <span className="avatar">
              {(user?.displayName || user?.email || 'V').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user?.displayName || 'Stüdyo üyesi'}</strong>
              <span>{authorization?.role === 'ADMIN' ? 'Yönetici' : 'Görüntüleyici'}</span>
            </div>
            <Button variant="ghost" aria-label="Çıkış yap" onClick={() => void logout()}>
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              variant="ghost"
              aria-label="Menüyü aç"
              className="mobile-menu button ghost"
              onClick={() => setOpen(true)}
            >
              <Menu size={20} />
            </Button>
            <span>Çalışma alanı</span>
            <span className="slash">/</span>
            <strong>
              {navigation.find((n) => n.path === location.pathname)?.name ||
                (location.pathname.startsWith('/accounts/') ? 'Hesap ekstresi' : 'Uygulama detayı')}
            </strong>
          </div>
          <div className="topbar-actions">
            <NavLink to="/history" className="top-search">
              <Search size={16} />
              <span>İşlemlerde ara</span>
              <kbd>⌕</kbd>
            </NavLink>
            <span className="secure-indicator">
              <span /> Güvenli oturum
            </span>
            <ThemeButton />
          </div>
        </header>
        <main id="main-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>Velonance · Stüdyonuzun finansal pusulası</span>
          <span>TRY · Europe/Istanbul</span>
        </footer>
      </div>
    </div>
  )
}
