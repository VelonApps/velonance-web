import { ArrowDownLeft, ArrowUpRight, Check, ShieldCheck, Sparkles } from 'lucide-react'
import { Brand, ThemeButton } from '../components/Layout'
import { Button, ErrorNotice } from '../components/ui'
import { useAuth } from '../lib/auth'
import { configured } from '../lib/firebase'
export default function Login() {
  const { user, error, login, logout } = useAuth()
  return (
    <div className="login">
      <section className="login-story">
        <Brand />
        <div className="login-copy">
          <span className="eyebrow">DAHA NET BİR FİNANSAL GELECEK</span>
          <h1>
            Fikrinizi büyütün.
            <br />
            <span>Finansınızı bilin.</span>
          </h1>
          <p>
            Uygulamalarınız, gelirleriniz ve stüdyonuzun bir sonraki adımı. Hepsi tek bir çalışma
            alanında.
          </p>
          <div className="login-illustration" aria-hidden="true">
            <div className="illustration-orbit" />
            <div className="illustration-card">
              <span>
                <Sparkles size={18} /> STÜDYONUZUN PUSULASI
              </span>
              <h3>
                Her kararın arkasında
                <br />
                net bir görünüm.
              </h3>
              <div className="illustration-bars">
                {[28, 42, 35, 57, 49, 72, 66, 87, 79, 100, 90, 118].map((h, i) => (
                  <i style={{ height: h }} key={i} />
                ))}
              </div>
              <div className="illustration-caption">
                <span>
                  <ArrowDownLeft size={15} /> Gelir
                </span>
                <span>
                  <ArrowUpRight size={15} /> Gider
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="login-foot">
          VELON APPS <span>Bağımsız üretiyoruz. Bilinçli büyüyoruz.</span>
        </div>
      </section>
      <section className="login-access">
        <div className="login-theme">
          <ThemeButton />
        </div>
        <div className="login-box">
          <span className="access-icon">
            <ShieldCheck size={25} />
          </span>
          <span className="eyebrow">ÖZEL ÇALIŞMA ALANI</span>
          <h2>Hoş geldiniz.</h2>
          <p>
            Stüdyonuzun finansal görünümüne
            <br />
            güvenle erişin.
          </p>
          {!configured ? (
            <div className="setup-card">
              <strong>Çalışma alanınızı bağlayın</strong>
              <p>
                Firebase bağlantısı henüz yapılandırılmadı. Projedeki <code>SETUP_GUIDE_TR.md</code>{' '}
                belgesini izleyin ve <code>.env.example</code> dosyasındaki beş zorunlu alanı
                doldurun.
              </p>
              <span>
                <Check size={15} /> Gerçek finansal veri oluşturulmadı
              </span>
              <span>
                <Check size={15} /> Yetkisiz veri erişimi kapalı
              </span>
            </div>
          ) : (
            <>
              <Button onClick={() => void login()}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.7 2.9-4.3 2.9-7.7ZM12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.7A10 10 0 0 0 12 22ZM6.4 13.9a6 6 0 0 1 0-3.8V7.4H3a10 10 0 0 0 0 9.2l3.4-2.7ZM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.4l3.4 2.7C7.2 7.8 9.4 6 12 6Z"
                  />
                </svg>
                Google ile Giriş Yap
              </Button>
              <ErrorNotice error={error ? new Error(error) : null} />
              {user && (
                <div className="auth-identity">
                  <span>{user.email}</span>
                  <small>UID: {user.uid}</small>
                  <Button variant="secondary" onClick={() => void logout()}>
                    Başka hesap kullan
                  </Button>
                </div>
              )}
            </>
          )}
          <div className="login-security">
            <ShieldCheck size={16} />
            <span>Yalnızca önceden yetkilendirilmiş Google hesapları erişebilir.</span>
          </div>
        </div>
        <span className="login-copyright">
          © {new Date().getFullYear()} Velonance · Stüdyo Finans
        </span>
      </section>
    </div>
  )
}
