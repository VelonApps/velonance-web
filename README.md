# Velonance

Mobil uygulama stüdyosu için Türkçe, özel finans çalışma alanı. React + TypeScript + Vite arayüzü; Google Authentication ve Cloud Firestore veri katmanı; GitHub Pages dağıtımı.

**Üretim Firebase projesi bağlanmadı ve internet üzerinde dağıtım yapılmadı.** Yapılandırma eksikse uygulama kurulum ekranında kalır. Örnek finansal veri veya yetkili kullanıcı üretilmez.

## Başlangıç

Node 24 LTS önerilir (geliştirme doğrulaması Node 22.22.2 ile de yapılmıştır). Güvenlik testleri Java 21 gerektirir.

```sh
npm ci
cp .env.example .env.local
# .env.local içine kendi Firebase web yapılandırmanızı ve stüdyo kimliğini girin.
npm run dev
```

İlk yönetici belgesini oluşturmadan finansal ekranlar açılmaz. Adım adım yönergeler: [SETUP_GUIDE_TR.md](SETUP_GUIDE_TR.md).

## Modüller

- Genel bakış: dönem filtreleri, tahakkuk bazlı özetler, gerçek kayıtlardan gelir/gider, gider dağılımı, uygulama geliri ve kâr grafikleri.
- Gelir ve gider: oluşturma, düzenleme, iptal, ödeme durumunu güncelleme, tarihsel kur, belge referansı, Apple brüt/net hesabı, gider dağıtımı.
- Uygulamalar: oluşturma, düzenleme, arşivleme, uygulama detayları, doğrudan katkı ve dağıtım sonrası kârlılık.
- Hesaplar: ISO para birimleri, kilitli açılış bilgisi, gerçek defterden sunucu toplamalarıyla bakiye; atomik ve tekrar güvenli, iki bacağıyla iptal edilebilen transfer.
- Borç ve alacak: para/özel altın birimi, tarihsel/güncel değer, kısmi/tam ödeme, aynı altın biriminde ayni teslim veya mutabakatlı para ödemesi. Ödemeler atomik ve tekrar güvenlidir. Hatalı kayıt iptal edilir, ödeme geri alınır, finansal olmayan alanlar düzenlenir.
- Tekrarlayan gider: düzenlenebilir şablon, haftalık/aylık/üç aylık/yıllık/özel takvim, duraklatma, iptal, tek oluşum gerçekleştirme/atlama.
- Nakit akışı: ödeme tarihine göre günlük/haftalık/aylık grafik, kendi para biriminde dönem açılış/kapanış hesabı, 90 günlük varsayımlı tahmin.
- Raporlar: önceki dönemle karşılaştırma, finansal durum (nakit, alacak, borç, net pozisyon), gider grubu / kategori / tedarikçi dağılımı, gelir kategorileri, açık borçlar, aylık sonuçlar, uygulama karşılaştırma, kaynağı belirtilmiş manuel kampanya verileri üzerinden CPI/CPC/CTR/ROAS, CSV ve yazdırma.
- Hesap geçmişi: hesap başına tarih aralıklı ekstre, yürüyen bakiye, CSV ve yazdırma.
- Kayıtlar (yalnız yönetici): kim, ne zaman, neyi değiştirdi (alan alan önce/sonra, filtreler, CSV), oturum geçmişi, yetkisiz giriş denemeleri.
- İşlem geçmişi: tarih aralığı, arama, tür/uygulama/kategori/para birimi/TRY tutar filtresi, sayfalama.
- Ayarlar: şirket adı, kategori/alt kategori, manuel döviz/altın fiyat geçmişi, yetkili kullanıcı görüntüleme, tema, CSV, tam JSON arşiv, sınırlı güvenli JSON içe aktarma, yazdırma.

## Doğrulama

```sh
npm run lint
npm run typecheck
npm test
npm run test:rules
npm run build
npm audit --omit=dev
```

`test:rules` yalnızca `demo-velonance` ve `demo-velonance-repository` emülatör projelerini kullanır; üretime bağlanmaz. Java 21 kurulu ve `JAVA_HOME` doğru olmalı. Firestore Emulator ilk çalıştırmada indirilir. Mevcut kayıtlar yalnızca bu geçici test projelerinde temizlenir.

`npm run check`: lint + TypeScript + birim/arayüz testleri + derleme. Emülatör testleri ayrı komuttur ve GitHub Actions doğrulamasında zorunludur.

## Belgeler

- [Türkçe kurulum](SETUP_GUIDE_TR.md)
- [Mimari ve sınırlar](ARCHITECTURE.md)
- [Finansal kurallar](FINANCIAL_RULES.md)
- [Firestore şeması](FIRESTORE_SCHEMA.md)
- [Güvenlik modeli](SECURITY.md)
- [Dağıtım](DEPLOYMENT.md)
- [Doğrulama sonuçları](VALIDATION.md)

## İlk sürümün sınırları

Bu uygulama basitleştirilmiş bir operasyonel defterdir; mevzuata uygun muhasebe yazılımı olduğu iddia edilmez. Tam çift taraflı muhasebe, otomatik banka/App Store bağlantısı, otomatik kur sağlayıcısı, dosya yükleme, sunucuda zamanlanmış iş, faiz tahakkuku, taksitli Apple tahsilatı ve sunucu tarafından doğrulanmış eksiksiz denetim izi yoktur.

Bir gelir/gider tek tam ödeme ile kapatılır. Parçalı tahsilatlar, ayrı kazanılmış dönem kayıtları olarak açıkça bölünmeli; banka masrafları ayrı gider olarak kaydedilmelidir. Bağlı transfer/borç/oluşum kayıtları sonradan düzenlenmez. Yanlış bağlı kayıt düzeltmeleri güvenilir yönetici süreci gerektirir. JSON içe aktarma tüm arşivi geri yükleyen bir felaket kurtarma aracı değildir; detayları belgelerde yer alır.

Raporlar dönem başına en fazla 1.000 işlem; referans listeleri koleksiyon başına 250 kayıtla sınırlıdır. İşlem geçmişi ve tam JSON arşiv sayfalanır. 1.000 işlem üzerindeki rapor toplam üretmez, daha dar aralık ister. Büyük ölçek için sunucuda özetleme ve gelişmiş arşiv yönetimi gerekir.
