# Finansal kurallar

Bu belgede verilen rakamlar hesaplama örnekleridir; uygulamaya başlangıç kaydı olarak eklenmez.

## Para ve hassasiyet

- Tutarlar kuruş benzeri tam sayı `amountMinor` alanında saklanır. TRY/USD/EUR/GBP: iki basamak; JPY/KRW: sıfır; KWD/BHD/OMR: üç. Diğer ISO kodları iki basamak varsayar. Başka hassasiyette birim için `scale()` genişletilmelidir.
- Miktar ve fiyatlar altı ondalık basamaklı mikro tam sayılardır. `quantityMicros=10_000_000` → 10 birim; `rateMicros=42_500_000` → 42,5 TRY/birim.
- Hesaplamalar Decimal.js ile; para dönüşümünde HALF_UP. Fazla ondalık basamak sessizce kesilmez, reddedilir.
- Tek tutar ve kur/miktar alanında üst sınır 10^12 saklama birimidir. Firestore aggregate sonucunun güvenli tam sayı sınırını aşması hata üretir.
- TRY işleminin kuru 1'dir. İşlemin orijinal tutarı, para birimi, tarihsel kuru, TRY karşılığı, dönüşüm tarihi ve manuel yöntemi saklanır.
- Manuel değerleme geçmişinin son tarihli, bugün veya öncesine ait fiyatı güncel tahmindir. Aynı gün fiyatlarında en son oluşturulan kayıt seçilir. Güncel fiyat eklemek tarihsel işlem değerini değiştirmez.
- Kur olmayan hesap/borç güncel TRY toplamından dışlanır ve eksik birimler belirtilir. Eksik kur 0 veya 1 varsayılmaz.

## Tahakkuk ve nakit

Eylül'de kazanılan 100 USD gelir, `date` Eylül olacak şekilde kaydedilir. Ekim tahsilatında aynı belge `settled` yapılır, `cashDate` Ekim seçilir. Eylül geliri korunur; Ekim nakit girişi oluşur. İkinci bir gelir kaydı eklenmez.

Bekleyen gelir/gider, kazanılmış/oluşmuş tutarı ifade eder; gelecek plan değildir. Gelecekteki gider planı `recurringTemplates` içinde tutulur. İptal edilmiş işlemler hem tahakkuk hem nakit toplamlarından çıkarılır.

Bir gelir/gider belgesinde yalnız bir tam ödeme desteklenir. Çoklu kısmi payout mutabakatı ve döviz değerleme farkı muhasebesi uygulanmamıştır. Bankaya yatan tutar net proceeds'ten farklıysa farkın nedenini ayrı gider/düzeltme kayıtlarıyla açıklayın; bankanın ödeme para birimi farklıysa aynı para biriminde ara hesap ve transfer kullanın. Gerçek Apple raporuyla mutabakatı kullanıcı yapar.

## Apple gelirleri

- Brüt mod: brüt satış − (brüt × komisyon / 10.000) − iadeler + net düzeltme. Komisyon 15%, 30% veya özel olabilir. Düzeltme alanına kesinti için negatif sayı girilir.
- Net mod: girilen tutar Apple net developer proceeds değeridir; tekrar komisyon/iade düşülmez. Brüt/komisyon/iade bilgileri açıklayıcı metadatadır.
- `apple.period` rapor dönemi; `date` muhasebesel tahakkuk tarihi; `cashDate` bankaya gerçekten ödendiği gündür.
- Uygulama bir vergi motoru değildir. Brüt komisyon tabanı ve düzeltmeleri gerçek Apple raporuna göre kullanıcı belirlemelidir.

## Kâr ve dağıtım

Gelir − gider = net kâr. Marj = net kâr / gelir × 100. Gelir sıfırsa marj `null`/“—” olarak gösterilir; sonsuz oran üretilmez.

Doğrudan uygulama seçimiyle yüzde dağıtım birlikte kullanılamaz. Yüzdeler tam sayı baz puan olarak saklanır; benzersiz en fazla beş uygulamada toplam 10.000 olmalıdır. İlk paylar aşağı yuvarlanır, kalan kuruş son paya verilir; pay toplamı gideri tam karşılar.

Uygulama doğrudan katkısı = uygulama geliri − doğrudan gider. Net kâr = katkı − paylaştırılmış ortak gider. Dağıtılmamış şirket gideri uygulamalara otomatik yüklenmez. Reklam/AI/altyapı alt özetleri doğrudan giderleri belirtir; net kâr paylaştırılmış giderleri de içerir.

## Anapara ve altın

- Borç almak gelir değildir. Borç vermek gider değildir. Anapara geri ödemesi faaliyet gideri değildir. Alacak anapara tahsilatı yeni gelir değildir.
- Borç kaydında isteğe bağlı ilk nakit hareketi aynı transaction içinde oluşturulur. Önceki dönem borcu/ayni altın tesliminde nakit hareketi seçilmez.
- `quantityMicros` özgün borç miktarıdır, değiştirilemez. `repaidMicros` atomik ödemeler toplamıdır. Kalan = özgün − ödenen; fazla ödeme reddedilir.
- Altın türü serbest birim adıdır: Gram, Çeyrek, Yarım, Tam veya özel ad. Değerleme fiyatındaki birim adı borçtakiyle aynı olmalıdır.
- İlk toplam değer, kalanın tarihsel değeri ve güncel kalan tahmini ayrı gösterilir. Altın fiyat artışı gerçekleşmiş gider değildir.
- Özgün altın biriminde ayni teslim repayment oluşturur; nakit hesabına dokunmaz.
- Başka para biriminde kapamada özgün miktar, gerçek nakit tutarı/kur/hesap ve açık mutabakat saklanır. Özgün borç birimi değiştirilmez.
- Sözleşme faizi metadatadır; otomatik faiz tahakkuku yoktur. Gerçekleşmiş faiz ayrıca gelir/gider kaydedilmelidir. Taksit takvimi otomasyonu yoktur; vade ve koşul notu vardır.

## Hesaplar ve transfer

Açılış bakiyesi/tarihi/para birimi oluşturulduktan sonra kilitlidir. Yanlış açılış için boş hesabı arşivleyip doğru hesap oluşturun; işlem görmüş hesap düzeltmesi için güvenilir yönetici süreci kullanın. Açılıştan önce ödeme yazılamaz. Negatif bakiye mümkündür; kredili mevduat veya eksik kayıt için kullanıcı incelemesi gerekir.

Transfer iki hesapta atomik karşı bacakları oluşturur. Aynı para biriminde çıkış ve giriş eşittir; farklı birimlerde gerçek iki tutar açıkça girilir. Kur farkı gelir/gider olarak otomatik yazılmaz. Masraf ayrı giderdir.

Dönem açılış/kapanışları özgün para biriminde gösterilir. Güncel TRY nakit değerleri güncel manuel kurlardan gelir. Gelir/gider ve gerçekleşmiş nakit TRY akışları tarihsel kurlarla hesaplanır; bu değerleme kavramları tek bakiye diye karıştırılmaz.

## Tekrarlayan gider ve tahmin

Şablon gerçek gider değildir. Kullanıcı aktif şablonun sıradaki oluşumunu gerçekleştirir veya atlar; açık tarayıcıya/zamanlayıcıya güvenilmez. Gerçekleştirme tek gider + tek nakit hareketi + tek oluşum yaratır. Ödeme tarihi ve o günün kuru kullanıcıdan alınır. Gelecek oluşumu gerçekleşmiş gider diye işaretleme arayüzden engellenir.

Aylık ilerlemede kısa ayın son gününe uyarlanır ve sonraki tarih bu günden devam eder (31 Ocak → 28 Şubat → 28 Mart). Tahmin bir şablonda en fazla 120 oluşum inceler. Şablon tarihini elle değiştirmek planı etkiler; önceden oluşturulmuş kayıtlar değişmez.

90 günlük tahmin: güncel nakit + bekleyen gelir − bekleyen gider ± borç/alacak vade tutarı − aktif tekrar planları. Gecikmiş açık kalemler dahildir. Borcun kalan tamamının vadede nakitle ödeneceği/altının nakde çevrileceği varsayılır. Bekleyen işlemin tarihsel kuru, tahminde açıkça tahmini değerdir. Aynı yükümlülüğün iki modülde girilmemesi kullanıcı sorumluluğudur. Tahmin garanti değildir.
