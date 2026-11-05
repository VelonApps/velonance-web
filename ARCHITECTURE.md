# Mimari

## Teknolojiler

React, TypeScript (strict), Vite, Tailwind v4 + özel tasarım değişkenleri, HashRouter, TanStack Query, React Hook Form, Zod, Decimal.js, date-fns, Recharts, Lucide. Firebase modüler SDK; Authentication, Firestore ve isteğe bağlı App Check. npm kilit dosyası sürümleri sabitler.

Form resolver'ı, yeni sürümün npm optional peer çözümleme çakışması nedeniyle uyumlu 5.2.2 sürümüne sabitlendi. Firebase 12.19.0, kural testi paketinin desteklediği ana sürümdür. `@firebase/app` 0.16.2 ve `@firebase/app-compat` 0.5.18 override'ları aynı SDK'nın iki farklı örneğinin yüklenmesini önler. `@grpc/grpc-js` 1.14.6 override'ı güvenlik düzeltmesini taşır. Bu seçimler gerçek emülatör entegrasyon testleriyle doğrulanır; güncellerken lock dosyası ve testler birlikte değerlendirilmelidir.

## Katmanlar

| Konum                   | Görev                                                                   |
| ----------------------- | ----------------------------------------------------------------------- |
| `src/lib/models.ts`     | Tipler, şemalar, isteğe bağlı portföy/kategori listeleri                |
| `src/lib/finance.ts`    | Saf decimal hesaplar; kur, kâr, dağıtım, borç, takvim                   |
| `src/lib/firebase.ts`   | Yapılandırma, yalnız bellek önbelleği, emülatör, isteğe bağlı App Check |
| `src/lib/auth.tsx`      | Google oturumu, UID yetki belgesi dinleme, iptal ve önbellek temizliği  |
| `src/lib/repository.ts` | Gerçek Firestore CRUD, atomik çoklu kayıt işlemleri, sunucu toplamaları |
| `src/lib/data.ts`       | Sorgu anahtarları ve bellekte sorgu önbelleği                           |
| `src/lib/backup.ts`     | Yetkili CSV/JSON, içe aktarım önizleme ve yinelenen kimlik koruması     |
| `src/components`        | Tekrarlı form, tablo, modal, filtre ve grafikler                        |
| `src/pages`             | Lazy yüklenen işlevsel modüller                                         |
| `firestore.rules`       | Gerçek sunucu güvenlik sınırı                                           |

## Finansal kayıt modeli

Tam double-entry yerine açık işlem türleri ve nakit bacakları kullanan basitleştirilmiş defter:

- `income`, `expense`: `date` tahakkuk tarihidir. `cashDate` ödeme tarihidir. Bekleyen işlem kâr/zarara girer, nakde girmez. Tam ödeme aynı belgeyi günceller, yeni gelir doğurmaz.
- `transfer_in`, `transfer_out`: iki ayrı hesapta, karşılıklı link içeren atomik iki belge. Kâr/zarara dahil değildir; stüdyo dışı nakit akışına dahil değildir.
- `debt_draw`, `debt_lend`, `debt_repay`, `debt_collect`: anapara nakit hareketleri. Kâr/zarara dahil değildir.
- Altının ayni geri ödemesi: repayment + borç toplamı atomik değişir; nakit işlemi oluşturmaz.

Hesap bakiyesi = kilitli açılış + `sum(cashInMinor)` − `sum(cashOutMinor)`. Firestore aggregate sorguları kullanılır. Bakiyeyi tutan bağımsız, düzenlenebilir bir alan yoktur. Dönem açılış/kapanışları hesap bazında ve özgün para biriminde sunucu toplamalarıyla hesaplanır. Güncel TRY nakit değeri yalnız ayrıca girilmiş manuel değerleme kurlarıyla hesaplanır.

## Tutarlılık ve tekrar güvenliği

- Borç oluşturma + ilk anapara hareketi; ödeme + kalan anapara + nakit hareketi; transferin iki bacağı; tekrar oluşumu + gerçek gider + şablonun sonraki tarihi: Firestore transaction.
- Transaction callback önce bütün gerekli belgeleri okur, ardından yazar.
- Ödeme ve transfer formları açılışta sabit işlem kimliği üretir. Aynı anahtar yeniden gönderilince yeni belge yaratılmaz.
- Gelir/gider formunda sabit belge kimliği, belirsiz ağ sonucu sonrası tekrar gönderimde kopyayı önler.
- Tekrarlayan oluşum kimliği `templateId_YYYY-MM-DD`; aynı oluşum ikinci kez oluşturulamaz.
- Ödemede güncel `repaidMicros` transaction içinde okunur; eşzamanlı fazla ödeme engellenir. Kurallar parent/child ve ödeme/nakit bacaklarını `getAfter()` ile birbirine bağlar.
- Finansal belgeler fiziksel silinmez. Bağımsız gelir/gider iptal edilir; referans kategorisi yumuşak silinir; uygulama ve hesap arşivlenir. Bağlı finansal kayıtlar düzenlenmez.

## Sorgular ve performans

- Dashboard/raporlar tahakkuk veya nakit tarihiyle sınırlandırılır. Tek raporda 1.000 işlem üzeri hata verir; kısmi toplam gösterilmez.
- Geçmiş, 50'lik cursor sayfaları kullanır. Metin ve ek filtreler yüklenen sayfalara uygulanır; arayüz bu sınırı belirtir.
- Referans koleksiyonları en fazla 250 satır alır, sınır uyarısı gösterir. Kategorilerin arşivlenmiş adları geçmiş görünümü için tutulur.
- Tam JSON arşiv 250'lik sayfalarla tüm tenant koleksiyonlarını okur. Bu kullanıcı tarafından başlatılan bir işlemdir.
- Query önbelleği yalnız RAM'dedir; periyodik gerçek zamanlı finans dinleyicisi yoktur. Yetki belgesi canlı dinlenir. Rol iptalinde ekran kapanır, sorgu önbelleği temizlenir.
- Tekil hesap bakiyesi/dönem toplamaları tüm ilgili index girdilerini tarayabilir. Spark limitleri ve aggregate okuma maliyetleri Firebase Console'dan izlenmelidir.
- İlk Firebase chunk'ı yaklaşık 560 kB ham / 167 kB gzip olabilir; Vite boyut uyarısı güvenlik hatası değildir. Grafik ve ekranlar ayrıca yüklenir.

## Güvenilirlik sınırı

Yetkili ADMIN işletme verisinin güvenilen yazarıdır. Kurallar rol güvenliği, tipler, sahiplik metadata'sı, nakit bacakları, hesap para birimi ve bağlı işlemlerin temel tutarlılığını doğrular. Bütün muhasebe politikaları bir güvenilir sunucu tarafından yeniden hesaplanmıyor. Tamper-proof denetim, imzalı kayıtlar, tam arşiv geri yükleme ve gelişmiş düzeltme işlemleri için güvenli backend gerekir.

Ayarlar modülü yetki listesini okuyabilir, kullanıcı/rol yazamaz. Kullanıcı yönetimi bilerek Console/Admin SDK bootstrap sürecindedir. Kalıcı service account dosyası veya Cloud Function dağıtımı bu projede yoktur. Spark uyumlu istemci mimarisi esas alınır; Blaze gerektiren opsiyonel backend kurulmamıştır.

## Yerelleştirme

Finans modeli dil bağımsız kodlar kullanır. Görünür metinler Türkçe React bileşenlerindedir; gelecekte çeviri sözlüklerine çıkarılabilir. Tam çeviri kütüphanesi/dinamik dil seçimi uygulanmamıştır. İstanbul tarih yardımcıları ve `Intl` biçimleyicileri merkezi dosyadadır. İlk sürüm raporlama para birimi TRY olarak sabittir.
