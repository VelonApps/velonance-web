# Doğrulama raporu

2 Kasım 2026 · yerel çalışma. Yayın öncesi denetimde üç kural hatası bulunup giderildi (aşağıda).

## Denetimde bulunan hatalar

| Hata                                                        | Etki                                                                                                                          | Çözüm                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Kurallarda `tutar / ölçek` tam sayı bölmesi kuruşu atıyordu | Kuruşlu her gelir, gider, borç ve ödeme `permission-denied` alıyordu; eski testler yalnız tam tutar kullandığı için görünmedi | Kayan noktalı TRY denetimi (±1 kuruş), anapara için tam sayı çarpımı |
| 1.000 ifade sınırı                                          | Uygulamalara dağıtılan gider hiç kaydedilemiyordu; borç kaydında pay kalmamıştı                                               | `member`, `transactionValid`, dağılım kuralları sadeleştirildi       |
| İptal yolu yoktu                                            | Hatalı borç, transfer ve ödeme kalıcıydı                                                                                      | Kural ve arayüz akışları eklendi                                     |

## Başarılı kontroller

| Kontrol                | Sonuç                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Temiz `npm ci`         | Başarılı; Node 22.22.2 / npm 10.9.7                                                                              |
| `npm run lint`         | Başarılı                                                                                                         |
| `npm run typecheck`    | Başarılı                                                                                                         |
| `npm test`             | 82 finans / veri aktarımı / log biçimi / React arayüz testi başarılı                                             |
| `npm run test:rules`   | 66 Firestore kuralı / gerçek repository entegrasyon testi başarılı                                               |
| Toplam                 | **148 test başarılı**                                                                                            |
| `npm run build`        | Başarılı; yapılandırmasız güvenli kurulum ekranı ile üretilir                                                    |
| Alt yol derlemesi      | `/velonance-path-check/` ile ayrı geçici üretim çıktısı; HTML'deki 7 asset referansı doğru prefix ile doğrulandı |
| `npm audit --omit=dev` | 0 bilinen üretim bağımlılığı açığı                                                                               |
| Kaynakta sır taraması  | Private key, Firebase API key kalıbı veya GitHub token kalıbı bulunmadı                                          |
| Tarayıcı               | Derlenmiş kurulum ekranı açıldı, hata seviyesinde console kaydı görülmedi                                        |
| Mobil 390px            | Açık/koyu tema, kurulum ekranı; document width=390 / scrollWidth=390                                             |
| Masaüstü 1280px        | Kurulum ekranı; document width=1280 / scrollWidth=1280                                                           |

Güvenlik testlerinde, makinede sistem Java'sı bulunmadığından resmî Adoptium kaynağından geçici klasöre alınmış Java 21 çalışma ortamı kullanıldı. Üretim Firebase hesabına bağlanılmadı. Tekrar çalıştırmak için kendi Java 21 kurulumunuzu `JAVA_HOME` ile ayarlayın. CI bunu setup-java ile kurar.

## Test kapsamı

- Decimal hassasiyeti, TRY/USD/EUR/JPY/KWD dönüşümleri, mikro hassasiyet ve sınırlar.
- Tarihsel kurun korunması, güncel değerleme, gelecek fiyatın dışlanması, altın/döviz birim adlarının ayrılması, eksik kurların belirtilmesi.
- Altın değerleme, kısmi/tam ödeme ve fazla ödeme reddi; kredi anaparasının gelir/gider dışında tutulması.
- Gider dağılımı, küsuratların toplamı koruması, katkı/net kâr/marj ve dağıtılmamış şirket giderleri.
- Apple %15/%30/özel komisyon, iadeler, net proceeds'in tekrar kesilmemesi; brüt formunda boş net alanının engel olmaması.
- Tahakkuk ve tahsilat ayrımı, transferin iki bacağı, nakit toplamları, tekrar takvimi, reklam ölçümlerinde eksik veriler.
- CSV formula injection, JSON şema/tenant/ID doğrulama, yinelenen kimlik, desteklenmeyen bağlı restore kayıtları.
- Korumalı rota, yükleme, boş durum, Türkçe para, form doğrulama, gelir oluşturma, aynı ID ile düzenleme, geçmişte metin filtresi.
- Anonim/yetkisiz/VIEWER/ADMIN, yanlış e-posta, doğrulanmamış hesap, Google dışı sağlayıcı, pasif üyelik, tenant ayrımı, rol yükseltme/rol belgesi koruması.
- Geçersiz tutar/kur/nakit alanları/metadata/şema/ek alan reddi; hesap para birimi ve açılış tarihi; audit değiştirilemezliği.
- Gerçek repository + gerçek emülatör: gelir tahakkuk/tahsilatının tek belge olması, hesap bakiyesi, tekrar transferi, para anaparası, altının TRY ile mutabakatlı kapatılması, eşzamanlı fazla ödemelerden yalnız birinin kabulü, tek oluşum/tek gider ve create-only import.

## Görsel kanıtlar

- `docs/login-mobile-light.jpg`: 390px açık tema.
- `docs/login-mobile-dark.jpg`: 390px koyu tema.

Ekran görüntülerinde finansal veri yoktur. Giriş sayfasındaki dekoratif grafik gerçek bir finansal rapor değildir ve erişilebilirlik ağacından gizlenmiştir.

## Yapılmayan / dış yapılandırma gerektiren kontroller

- Gerçek Google OAuth popup akışının üretim hesabıyla uçtan uca tamamlanması: gerçek Firebase config/authorized domains yok. Yerel Auth Emulator popup denemesi tamamlanmadı; başarılı OAuth testi olarak sayılmadı.
- Yetkili ekranları gerçek production Google oturumuyla gezme: bootstrap sonrası yapılmalı. Auth + Firestore Emulator üzerinde kurallar açıkken tarayıcıda denendi: yetkisiz, ADMIN ve VIEWER girişi, kuruşlu/dövizli/dağıtılmış kayıt, `1.234,56` girişi, raporlar, hesap ekstresi, kayıtlar, borç ve transfer iptali, ödeme geri alma, 375px mobil. Google popup penceresi emülatörde kimlik belirteciyle atlandı.
- Kalıcı Playwright uçtan uca otomasyon paketi eklenmedi. Tarayıcı QA yerel uygulama üzerinden yapıldı.
- Gerçek Firestore composite index dağıtımı: emulator index ihtiyacını üretimle birebir zorlamaz. Dokuz indeks Console'da Enabled olmalı.
- Gerçek GitHub Actions çalıştırması ve Pages yayını: henüz Git deposu/remote veya hesap yapılandırması yok. Workflow dosyası hazır; dış hizmette çalıştırılmadı.
- App Check enforcement, IAM ve Console bootstrap: kullanıcı hesabında ayrıca yapılmalı.

## Kalan uyarılar

- Firebase SDK chunk'ı yaklaşık 560 kB ham / 167 kB gzip; Vite 500 kB uyarısı verir. Derleme başarılıdır; ekranlar ve grafikler lazy/chunk olarak ayrıdır.
- Geliştirme bağımlılıklarında Firebase CLI → Pub/Sub/OpenTelemetry ve gaxios/uuid kaynaklı **5 orta seviye** audit uyarısı vardır. Üretim bundle'ına dahil değildir. Kör force downgrade uygulanmadı; SECURITY.md detaylandırır.
- Sunucu tarafından doğrulanmış audit geçmişi, IP kaydı, tam bağlı JSON restore, parçalı Apple payout, otomatik banka/Apple/kur entegrasyonları, vergi motoru ve otomatik faiz tahakkuku yoktur. Sınırlar README ve mimari belgede listelenmiştir.

Test emülatörleri, geçici `.env.local` ve önizleme sunucuları teslim öncesi kapatıldı/kaldırıldı. Gerçek finansal başlangıç kaydı, kullanıcı yetkisi veya üretim sırrı oluşturulmadı.
