# Firestore şeması · v1

## Yetki

`authorizedUsers/{firebaseUid}`:

| Alan                 | Tür            | Anlam                                   |
| -------------------- | -------------- | --------------------------------------- |
| uid                  | string         | Belge ID ve Auth UID ile aynı           |
| email                | string         | Google token e-postasıyla tam eşleşmeli |
| studioId             | string         | Bu üyeliğin ait olduğu tek stüdyo       |
| role                 | ADMIN / VIEWER | Yazma veya salt okuma                   |
| active               | boolean        | Erişim etkinliği                        |
| createdAt, updatedAt | timestamp      | Console/Admin SDK ile bakım             |

Tek UID ilk sürümde tek stüdyoya bağlıdır. Çok stüdyolu üyelik geçişi yoktur. Client yetki belgesine yazamaz.

## Stüdyo

Bütün iş kayıtları `studios/{studioId}/{collection}/{id}` altındadır. `studios/{studioId}` üst belgesinin fiziksel olarak var olması gerekmiyor; şema kuralları alt koleksiyonlara uygulanır. Studio kimliği public yapılandırmadır, sır değildir.

Ortak entity metadata:

- `createdAt`, `updatedAt`: Firestore serverTimestamp.
- `createdBy`, `updatedBy`: Firebase Auth UID.
- `schemaVersion`: tam sayı 1; değiştirilemez.
- `deleted`: boolean. Finansal belgelerde false; arşivlenebilir referanslarda soft delete.
- `id`: uygulama belleğinde document ID'den eklenir; Firestore entity body içine yazılmaz.

## Koleksiyonlar

| Koleksiyon           | Önemli alanlar                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| applications         | name, platform (iOS/Android/Both), bundleId, url (https veya boş), launchDate, status (development/testing/live/paused/archived), description, icon (metadata)                        |
| accounts             | name, currency (ISO), type (bank/cash/apple/other), openingMinor, openingDate, notes, archived                                                                                        |
| categories           | name, kind (income/expense), group (income/advertising/ai/infrastructure/business/development/other), parentId                                                                        |
| exchangeRates        | unit, priceMicros, date, asset (currency/gold). Altın fiyatları da aynı koleksiyondadır.                                                                                              |
| obligations          | direction (payable/receivable), counterparty (metin), title, asset, unit, quantityMicros, originalRateMicros, date, dueDate, notes, terms, interestBps, repaidMicros, lastRepaymentId |
| repayments           | obligationId, quantityMicros (özgün borç birimi), settlementAsset, currency (gerçek ödeme birimi), amountMinor, rateMicros, accountId, date, notes, agreement, transactionId          |
| recurringTemplates   | title, amountMinor, currency, rateMicros (tahmin), nextDate, frequency, intervalDays, applicationId, categoryId, accountId, status, notes                                             |
| recurringOccurrences | templateId, date, status (paid/skipped), transactionId                                                                                                                                |
| advertisingCampaigns | name, platform, applicationId, spendMinor, currency, impressions, clicks, installs, attributedRevenueMinor, source, date, endDate                                                     |
| settings/general     | name, currency (TRY), timezone (Europe/Istanbul), locale (tr-TR)                                                                                                                      |
| auditLogs            | entityType, entityId, action, actorUid, actorEmail, timestamp, before, after, schemaVersion. Ortak entity metadata yerine bu alanlar kullanılır. Yalnız ADMIN okur.                   |
| accessLogs           | event (sign_in / sign_out), uid, email, displayName, at, userAgent, schemaVersion. Üye kendi kaydını yazar, yalnız ADMIN okur, değiştirilemez.                                        |

Karşı taraflar ayrı müşteri/veresiye rehberi olarak modellenmemiştir; borçta `counterparty`, işlemde `vendor` metni kullanılır. Eki fiziksel dosya olarak saklayan koleksiyon yoktur.

## transactions

| Alan                                                       | Anlam                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| kind                                                       | income, expense, transfer_in, transfer_out, debt_draw, debt_lend, debt_repay, debt_collect |
| title, description, notes, vendor, invoice, attachmentName | Güvenli metin, en fazla 500 karakter                                                       |
| amountMinor, currency                                      | Özgün para biriminde pozitif tam tutar                                                     |
| rateMicros, tryMinor                                       | Tarihsel TRY kuru ve kaydedilmiş tarihsel karşılık                                         |
| conversionDate, conversionMethod                           | YYYY-MM-DD; manual                                                                         |
| date                                                       | Tahakkuk / anapara / transfer tarihi                                                       |
| status                                                     | pending, settled, cancelled                                                                |
| cashDate                                                   | Gerçek ödeme günü; ödeme yoksa boş                                                         |
| expectedDate                                               | Beklenen ödeme tarihi; yoksa boş                                                           |
| accountId                                                  | Ödeme varsa aynı para birimindeki hesap                                                    |
| applicationId, categoryId                                  | İsteğe bağlı referanslar                                                                   |
| group                                                      | Kategoriye bağlı raporlama grubu; geçmiş değer saklanır                                    |
| allocations                                                | `{applicationId,basisPoints}`; benzersiz en fazla 5, toplam 10000; boş liste şirket geneli |
| apple                                                      | null veya mode, grossMinor, commissionBps, refundMinor, adjustmentMinor, netMinor, period  |
| linkId                                                     | Transferin karşı bacağı / borç ID / recurring occurrence ID; bağımsız gelir-giderde boş    |
| cashInMinor, cashOutMinor                                  | Tamamlanmış işlemin özgün hesap para biriminde nakit bacağı; bekleyen/iptalde sıfır        |

Tarih alanları saat diliminden bağımsız iş günlerini `YYYY-MM-DD` biçiminde taşır. Oluşturma/güncelleme zamanları gerçek timestamp'tir. Zod gerçek takvim gününü doğrular; Firestore Rules tarih metninin biçimini doğrular. Bu ayrım, yetkili ADMIN'in güvenilen iş verisi yazarı olduğu sınırına dahildir.

## Bağlı kimlikler

- Transfer: UUID-out ve UUID-in; her bacak diğer ID'yi taşır.
- İlk anapara nakdi: transaction ID, obligation ID ile aynıdır; linkId obligation ID'dir.
- Nakit borç ödemesi: repayment ID = transaction ID; obligation.lastRepaymentId ödeme ID'si olur.
- Ayni altın ödemesi: repayment vardır, transactionId boş; nakit belgesi yoktur.
- Tekrar oluşumu: `templateId_YYYY-MM-DD`; paid ise transaction ID aynı ve linkId occurrence ID'dir; skipped ise transactionId boş.

Bağlı işlemler sonradan düzenlenmez. Aynı ödeme/oluşum belgesini ikinci kez yaratmak kurallarca reddedilir.

## İndeksler

`firestore.indexes.json` kaynak dosyadır. `transactions` için:

1. deleted ASC + date DESC + document ID DESC.
2. deleted ASC + cashDate DESC + document ID DESC.
3. accountId ASC + deleted ASC.
4. accountId ASC + deleted ASC + cashDate ASC.
5. deleted ASC + status ASC + expectedDate ASC.

Diğer tek alan sorguları Firestore varsayılan indekslerini kullanır. Emulator composite index gereksinimini üretimle aynı şekilde zorunlu kılmaz; indeksleri üretime ayrıca deploy edin ve sorguları canlı sistemde doğrulayın.

## Arşiv ve taşıma

Tam JSON arşiv schemaVersion, studioId, exportedAt ve koleksiyonların bütün sayfalarını içerir. Yetki belgeleri yedeğe alınmaz; IAM/rol bootstrap ayrı güvenlik sürecidir. Arşiv üretim ortamını otomatik yeniden kurmaz. Tarayıcı içe aktarımı yalnız referansları ve bağımsız gelir/gideri create-only olarak işler. Tam bağlı kayıt geri yüklemesi için izole bir projede güvenilir Admin SDK aracı, ilişki/hesap denklemi kontrolü ve yedek doğrulaması gerekir; böyle bir restore aracı bu sürümde yoktur.

## accessDenied/{uid}

Stüdyo dışında, üst düzey koleksiyon. Yetkisiz Google hesabının son denemesi: uid, email, studioId, lastAt, userAgent, schemaVersion. Hesap kendi belgesini yazar, okuyamaz; kendi stüdyosunun ADMIN'i listeler.

## İptal

Fiziksel silme yoktur. `transactions.status=cancelled` ve sıfır nakit alanlarıyla transfer çiftleri, anapara hareketleri ve tekrarlayan ödemeler iptal edilir. `obligations.deleted=true` ödemesi olmayan kaydı, `repayments.deleted=true` ödemeyi geri alır (`repaidMicros` birlikte düşer). Kurallar bağlı belgelerin aynı işlemde değiştiğini `getAfter` ile doğrular.
